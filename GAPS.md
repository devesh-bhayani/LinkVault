# GAPS.md — honest audit of known weaknesses

*Compiled 2026-07-07 from a full read of the codebase. Ordered by severity,
most important first. Each item is scoped so it can be executed as a single
task. When you fix one, delete its entry.*

---

## 1. RESOLVED IN CODE — pending manual migration apply

**Was:** `bulkCreateLinks()` upserts with `onConflict: 'url'`, but the schema
only had a **non-unique** index on `links.url`, so Postgres rejected every
import insert (error 42P10) and the import page fabricated a "N links saved"
success from `data?.length ?? selected.length`.

**Fixed 2026-07-07:**
- `supabase/migrations/002_unique_url.sql` added — dedupes existing `url`
  rows (keeps earliest `created_at`) then makes `idx_links_url` UNIQUE.
- `src/app/import/page.tsx` `handleConfirm` now reads `{ data, error }`,
  routes failures to a new `{ type: 'error' }` stage ("Import failed —
  nothing was saved", with Back to review), and counts only real
  `data?.length ?? 0`.
- `pnpm build` + `pnpm test` pass.

**STILL REQUIRED (user action):** apply `002_unique_url.sql` to the live
Supabase by hand (SQL editor or `supabase db push`). Until it's applied the
DB still lacks the unique index, so imports will now show the honest error
screen instead of a fake success. Verify one real import round-trip after
applying. **Then do item #5** — the unique index makes duplicate *manual*
saves fail with a raw constraint error until #5 handles code `23505`.

---

## 2. RESOLVED IN CODE — pending manual Supabase setup

**Was:** No authentication anywhere; anon key in the client bundle; RLS off.
Anyone who loaded a deployed instance could extract the key and get full
read/write/delete on both tables via Supabase's REST API.

**Fixed 2026-07-17 (Option A — single-user auth + RLS):**
- `supabase/migrations/003_enable_rls.sql` — enables RLS on
  `links`/`categories` with `TO authenticated USING (true) WITH CHECK (true)`
  policies. Single user, so "any signed-in user" IS the authorization model.
- `src/components/AuthGate.tsx` — login gate wrapping the whole app in
  `layout.tsx` (email + password against Supabase Auth; session persists per
  device). Sign-out button added to `Navbar`.
- Auth wrappers (`signIn`/`signOut`/`getSession`/`onAuthChange`) in
  `src/lib/db.ts`.
- `src/lib/supabase.ts` — server side (API routes only, never bundled) now
  prefers `SUPABASE_SERVICE_ROLE_KEY`, so `/api/quick-save` keeps writing
  under RLS; `scripts/backfill-categories.mjs` does the same.
- Verified: `pnpm build` + `pnpm test` pass; login screen renders at 375px,
  bad credentials surface the error inline.

**STILL REQUIRED (user actions, in this order):**
1. Supabase dashboard → Authentication → Add user (check **Auto Confirm**).
2. Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` (and Vercel env when
   deploying).
3. Apply `003_enable_rls.sql` by hand. From then on every browser session
   must sign in; anonymous queries return empty rows, not errors.

**Residual risk → see #4:** with RLS on, `/api/quick-save` (writing via the
service role) is the only unauthenticated write path left when
`QUICK_SAVE_API_KEY` is unset — #4's production key requirement now matters
more, not less.

---

## 3. RESOLVED — SSRF and unbounded reads in the metadata fetcher

**Was:** `fetchMetadataServer()` fetched any caller-supplied URL server-side
with `redirect: 'follow'` and read the whole body with `res.text()` — no IP
checks, no size cap, no content-type check, behind an unauthenticated route.
A classic SSRF probe (internal services, cloud metadata endpoints) plus a
memory/DoS vector.

**Fixed 2026-07-17** in `src/lib/fetch-metadata-server.ts`:
- Scheme allowlist (`http:`/`https:` only) + `localhost` block.
- `isSafeUrl()` resolves the host via DNS and rejects if ANY resolved
  address is loopback/private/link-local/CGNAT/reserved (v4 + v6, incl.
  IPv4-mapped) — so obfuscated forms (`2130706433`, `0x7f...`) and internal
  DNS names are caught, not just IP literals.
- Redirects followed manually (`redirect: 'manual'`, max 3), re-validating
  every hop.
- Content-type must be `text/html`/`application/xhtml`; body read is capped
  at 512 KB via the stream reader.
- Null-on-failure contract preserved.
- `isPrivateIp()` exported and unit-tested (`fetch-metadata-server.test.ts`,
  8 cases). Live-probed: `localhost`, `127.0.0.1`, `169.254.169.254`,
  decimal-encoded loopback, and `ftp://` all return nulls; `example.com`
  still returns metadata.

**Residual (accepted for a personal tool):** DNS rebinding between our
`lookup` and `fetch`'s own resolution isn't closed — a pinned-IP dispatcher
(e.g. `undici` with a custom lookup) would be the next step if this ever
serves untrusted callers at scale. The route is also still unauthenticated;
same-origin abuse after this hardening is low-risk (see #4).

---

## 4. RESOLVED — Endpoints open by default in production

**Was:** `POST /api/quick-save` required its bearer token only if
`QUICK_SAVE_API_KEY` was set (unset = anyone could inject links). `POST
/api/categorize` was always unauthenticated — a free public relay to a
tunneled Ollama.

**Fixed 2026-07-18:**
- `src/app/api/quick-save/route.ts` — in production, returns **503** when no
  `QUICK_SAVE_API_KEY` is configured (refuse rather than accept anonymous
  writes); the bearer check still applies whenever a key is set, dev or prod.
- `src/app/api/categorize/route.ts` — in production, requires a valid
  Supabase **session token** (Bearer). The in-app form is the only legit
  caller and now runs behind auth (GAP 2); a plain shared key can't be used
  because the browser can't hold a server secret. Dev stays open so local
  work needs no auth setup.
- `src/lib/db.ts` — `isValidAccessToken(token)` wraps `auth.getUser` for the
  route to validate the session.
- `src/components/QuickSaveForm.tsx` — attaches the session token to its
  `/api/categorize` call (harmless in dev, required in prod).
- Verified in dev: categorize → 200 (gate skipped), quick-save → 401 with a
  key set (gate active, not 503). Prod gates are logic-only (not live-tested;
  needs reachable Supabase + a prod build).

**Note:** `/api/fetch-metadata` stays open by design — browser-called without
a key, and SSRF-hardened in #3; same-origin abuse is the accepted residual.

---

## 5. RESOLVED — Manual duplicate saves now handled gracefully

**Was:** `createLink()` inserted blindly. Once #1's unique index exists,
duplicate saves from Quick Save / extension / Shortcut would fail with a raw
`23505` constraint error surfaced as the generic "Failed to save link."

**Fixed 2026-07-07:**
- `src/lib/db.ts` `createLink` now catches `error.code === '23505'` and
  returns a typed `{ data: null, error: null, duplicate: true }` (normal
  saves return `duplicate: false`).
- `src/components/QuickSaveForm.tsx` shows "Already in your library." as a
  success-style toast and clears the form.
- `src/app/api/quick-save/route.ts` returns `{ success: true, duplicate }` —
  still 2xx, so the extension badge shows ✓.
- `pnpm build` + `pnpm test` pass.

**Note:** the friendly path only triggers once migration `002` (item #1) is
applied to the live DB. Without the unique index there's no `23505`, so
duplicate manual saves still create duplicate rows — harmless, just untidy.

---

## 6. RESOLVED — Instagram export ZIP was buffered in memory twice

**Was:** `autoDetectCurrentUser()` and `parseInstagramExport()` each called
`JSZip.loadAsync(file)`, decoding a 100MB+ export into memory twice per import.

**Fixed 2026-07-18:** both functions now accept `File | JSZip` (via a `toZip`
helper in `instagram-parser.ts`); `ImportUploader.handleFile` calls
`JSZip.loadAsync(file)` once and passes the instance to detection and parsing,
and stores it in `pendingRef` so the manual-name path reuses it too. Parser
tests still pass a File and exercise the load-from-bytes branch.

---

## 7. RESOLVED — Username auto-detection could silently pick the wrong person

**Was:** The current user was inferred as the most-frequent participant, ties
broken arbitrarily. A 1–2 conversation export ties, and a wrong winner
inverts the import (keeps your messages, drops the creator's) with no warning.

**Fixed 2026-07-18:**
- `autoDetectCurrentUser` now returns `null` unless the top name's count is
  ≥ 2 **and** strictly greater than the runner-up — ambiguous exports fall
  through to the existing manual-name prompt instead of guessing.
- `ImportPreview` displays "Excluding messages you sent as **{username}**"
  with a "Not you?" link back to the upload/name step, so a wrong guess is
  visible and correctable.
- New test covers both the tie→null and multi-conversation→detected cases.

---

## 8. RESOLVED — Swallowed errors that made failures look like success

**Was:** Several paths ignored the `error` half of db.ts results or dropped
async failures — failed deletes vanished then reappeared on reload, the edit
modal failed silently, paginated reads returned partial data on error, and
`ImportUploader` fire-and-forgot an async `onParsed`.

**Fixed 2026-07-18:**
- `getAllLinks` / `getAllNormalizedUrls` now `throw error` mid-pagination
  instead of returning partial results (a partial dedup set would let real
  duplicates through import preview).
- `ImportUploader.onParsed` is typed `Promise<void> | void` and awaited inside
  the existing try/catch, so a throw in the page's dedup step lands on the
  error screen instead of hanging on progress.
- `LinkCard` gained an optional `onError` (threaded from both pages' toast via
  `LinkList`); `handleDelete` keeps the card and reports on failure,
  `handleToggleRead` reports too.
- `EditLinkModal.handleSave` shows an inline error instead of silently
  stopping the spinner.

---

## 9. RESOLVED — Categories had two sources of truth; custom tags never showed as pills

**Was:** Filter pills/colors came from the `categories` table but `links.category`
is free text with no FK, so a custom-typed tag saved fine yet never appeared
as a filter pill (reachable only via search).

**Fixed 2026-07-18 (managed option):** `db.ts` gained `ensureCategory(name)` —
a best-effort `upsert(..., { onConflict: 'name', ignoreDuplicates: true })`
that assigns a stable palette color (seeded categories keep their own colors
via `ignoreDuplicates`). `createLink`, `updateLink`, and `bulkUpdateLinks`
call it whenever they write a non-null category, so any tag becomes a filter
pill. It never throws — tagging must not fail a save.

**Leftover:** none — the superseded `createCategory()` was deleted in #12.

---

## 10. RESOLVED — CSV formula injection

**Was:** `escapeCsv()` quoted commas/quotes/newlines but passed through cells
starting with `=`, `+`, `-`, `@` — and description / `sender_message_context`
hold third-party Instagram text, so Excel/Sheets would execute them on open.

**Fixed 2026-07-26:** `escapeCsv` (now exported) prefixes a `'` when the value
starts with `=`, `+`, `-`, `@`, tab, or CR, then applies the existing quoting.
No exported column is numeric, so neutralizing `-` costs nothing. Covered by
the new `src/lib/export.test.ts` (11 cases incl. a `=HYPERLINK(...)` payload).

---

## 11. RESOLVED — Client race conditions

**Was:** The dashboard had no stale-response guard (a slow search could
overwrite a newer one) and fired a duplicate query on mount; QuickSaveForm's
late categorize response could repopulate a form the user had already saved
and cleared.

**Fixed 2026-07-26:**
- `src/app/page.tsx` — a `fetchGen` ref is bumped per fetch and stale
  responses are dropped; an `isFirstRender` ref skips the debounced search
  effect on mount so only the category effect loads initially.
- `src/components/QuickSaveForm.tsx` — a `metaGen` ref guards both the
  metadata and categorize `setForm` calls; submitting clears the pending
  debounce and bumps the generation, so in-flight work can't refill the
  cleared form.

---

## 12. RESOLVED — Dead code and dead config

**Fixed 2026-07-26.** Deleted: `getLinkById`, `getLinkStats`, and
`createCategory` from `src/lib/db.ts` (the last superseded by
`ensureCategory` in #9); the unused `tag.*` palette from
`tailwind.config.ts`; `categoryInputRef` from `QuickSaveForm`. The unused
`BookmarkPlus` import and `ImportUploader`'s duplicated pending-file state
were already removed by the #1 and #6 fixes. `pnpm build` confirms nothing
referenced them.

---

## 13. RESOLVED — Unpinned dependency

**Fixed 2026-07-26:** `"lucide-react": "latest"` → `"^0.577.0"` (the version
the lockfile already resolved), so regenerating the lockfile can't silently
jump a major and rename icons.

---

## 14. RESOLVED — Assorted correctness nits

**Fixed 2026-07-26:**
- `decodeEntities` now uses `String.fromCodePoint` via a `fromCodePointSafe`
  helper, so astral entities (`&#128512;`) decode to one emoji instead of two
  broken halves; out-of-range values fall back to the literal entity rather
  than throwing. Regression-tested.
- Both Cmd/Ctrl+Enter effects (`QuickSaveForm`, `EditLinkModal`) now bind once
  with `[]` deps, calling the latest handler through a ref instead of
  re-subscribing every render.
- `metadataBase` reads `NEXT_PUBLIC_SITE_URL` (documented in `.env.example`),
  falling back to localhost.
- `next.config.js` now sends a `Content-Security-Policy`. `connect-src` is
  derived from `NEXT_PUBLIC_SUPABASE_URL` (not a hardcoded `*.supabase.co`)
  so a self-hosted instance still works; `unsafe-eval` is dev-only.
  **Verified against a production build**: page renders, fonts/styles load,
  React hydrates, no CSP violations, and the Supabase auth request is
  permitted (it fails only because the host is unreachable from this machine).
- Single-card delete now confirms first, matching bulk delete — it's a
  one-tap permanent action on a phone.

---

## 15. OPEN (reduced) — Test coverage

**Tested:** `instagram-parser` (encoding round-trip, both URL sources,
own-message filtering, dedup, and post-#7 tie/multi-conversation detection),
`url-extractor`, `url-normalize`, `export` (quoting + formula injection),
`fetch-metadata-server` (private-IP guard, entity decoding, meta extraction).
52 tests across 5 files.

**Still untested — the important one:**
- The **entire write path**: `createLink`, `bulkCreateLinks`, and the import
  confirm flow. Item #1 shipped broken precisely because nothing executes
  these against a real or emulated Postgres, and every fix since (#1, #5, #9)
  has been verified only by build + unit tests. Smallest useful step: a gated
  integration test (vitest, skipped unless a `SUPABASE_TEST_URL` env var is
  set) that round-trips one insert, one duplicate insert, and one upsert
  against a scratch Supabase project.
- `/api/quick-save` and `/api/categorize` auth behavior — the production
  branches from #4 are logic-only so far. Testable by importing the route
  handlers and calling them with a stubbed `NODE_ENV` + fake Request.

**Note:** several fixes are also gated on manual DB work that hasn't happened
yet — migrations `002` and `003` still need applying by hand, and until then
duplicate handling (#5) and RLS (#2) are dormant.
