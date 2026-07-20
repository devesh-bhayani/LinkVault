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

**Leftover:** the old `createCategory()` is now superseded and still unused —
delete it as part of #12 (dead-code cleanup).

---

## 10. LOW-MEDIUM — CSV export is vulnerable to spreadsheet formula injection

**What:** `escapeCsv()` handles quotes/commas/newlines but not cells starting
with `=`, `+`, `-`, or `@`. Description and `sender_message_context` contain
third-party text (Instagram messages) and are exported verbatim; Excel/Sheets
will execute such cells as formulas on open.

**Where:** `src/lib/export.ts:18-25`.

**Fix (one task):** In `escapeCsv`, when the string starts with `=`, `+`,
`-`, or `@`, prefix a `'`. Add a unit test (`export.test.ts` — the module is
pure and currently untested).

---

## 11. LOW-MEDIUM — Client race conditions

**What:**
- Dashboard: no stale-response guard on `fetchLinks`; a slow search response
  can overwrite a newer one. Also both mount effects fire on load (category
  effect immediately, search effect 300ms later) → duplicate initial query
  (`src/app/page.tsx:74-92`).
- QuickSaveForm: the categorize suggestion lands after an `await` chain; if
  the user saves and the form clears first, the late response repopulates
  `category` on the now-empty form, polluting the next entry
  (`src/components/QuickSaveForm.tsx:58-92,107-134`).

**Fix (one task):** Add a generation counter ref incremented per fetch;
ignore responses whose generation is stale. In QuickSaveForm, clear the
debounce timer and bump the generation on submit. Skip the search debounce
effect on first render with a ref flag.

---

## 12. LOW — Dead code and dead config

**What/where:**
- `getLinkById`, `getLinkStats` in `src/lib/db.ts:81-89,211-229` — never
  called.
- `createCategory` (`db.ts:199-207`) — never called (see #9 before deleting).
- `tag.*` color palette in `tailwind.config.ts:19-28` — no `tag-*` class is
  used anywhere; real colors come from the DB.
- `categoryInputRef` in `src/components/QuickSaveForm.tsx:32` — assigned,
  never read.
- `BookmarkPlus` import in `src/app/import/page.tsx:5` — unused.
- `ImportUploader` duplicates the pending file in both `stage.needs_name.file`
  and `pendingFileRef` (`src/components/ImportUploader.tsx:15,24`).

**Why it matters:** Dead paths mislead future sessions into thinking they're
load-bearing (a stats widget, managed categories) and pad the audit surface.

**Fix (one task):** Delete all of the above (resolve #9 first for
`createCategory`); keep one of the two pending-file mechanisms. `pnpm build`
confirms nothing referenced them.

---

## 13. LOW — Unpinned dependency

**What:** `"lucide-react": "latest"` in `package.json`. The lockfile pins it
in practice, but any explicit upgrade or lockfile regeneration can jump a
major with breaking icon renames.

**Fix (one task):** Pin to the currently locked version with a caret (check
`pnpm list lucide-react`), e.g. `"^0.4xx.x"`.

---

## 14. LOW — Assorted correctness nits

- `decodeEntities()` uses `String.fromCharCode` for numeric entities; astral
  code points (`&#128512;` emoji) decode wrong. Use `String.fromCodePoint`
  (`src/lib/fetch-metadata-server.ts:15-16`).
- Keyboard-shortcut effects re-subscribe on every render (no dependency
  array): `src/components/QuickSaveForm.tsx:47-56`,
  `src/components/EditLinkModal.tsx:44-50`. Harmless today; a footgun if
  anyone adds cost to those handlers.
- `metadataBase: new URL('http://localhost:3000')` hardcoded in
  `src/app/layout.tsx:12` — wrong OG URLs when deployed (cosmetic; the site
  is `noindex`).
- `next.config.js` sets nosniff/frame/referrer headers but no
  `Content-Security-Policy`.
- Single-card delete has no confirmation (bulk delete does) — one mis-tap on
  a phone permanently deletes a link (`src/components/LinkCard.tsx:49-54`).

Each is a one-line-to-ten-line fix; batch them as one cleanup task.

---

## 15. Test coverage — what's tested and what isn't

**Tested (well):** `instagram-parser` (encoding round-trip, both URL sources,
own-message filtering, dedup), `url-extractor`, `url-normalize`.

**Untested, in order of pain:**
- The **entire write path**: `createLink`, `bulkCreateLinks`, and the import
  confirm flow. Item #1 shipped broken precisely because nothing executes
  these against a real or emulated Postgres. Smallest useful step: a manual
  verification checklist, or a gated integration test (`vitest` with env
  guard) that round-trips one insert/upsert against a dev Supabase project.
- `src/lib/export.ts` — pure functions, zero tests; add `export.test.ts`
  covering quoting, newlines, nulls, and (post-#10) formula injection.
- `src/lib/fetch-metadata-server.ts` — `getMeta`/`decodeEntities`/
  `resolveUrl` are pure; test attribute-order variants and entity decoding
  with fetch mocked.
- `/api/quick-save` auth behavior (401 with wrong key, open-when-unset,
  and post-#4 prod refusal).
- `autoDetectCurrentUser` tie/small-export behavior (post-#7).

**Suggested first task:** `export.test.ts` + `fetch-metadata-server.test.ts`
(pure logic, no infrastructure, ~an hour of work), then the #1 verification.
