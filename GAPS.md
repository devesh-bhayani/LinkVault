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

## 3. HIGH (security) — SSRF and unbounded reads in the metadata fetcher

**What:** `fetchMetadataServer()` fetches any caller-supplied URL server-side
with `redirect: 'follow'` and reads the entire body with `res.text()` — no IP
range checks, no size cap, no content-type check. The `/api/fetch-metadata`
route that exposes it is unauthenticated. On a deployed instance this is a
classic SSRF probe (internal services, cloud metadata endpoints via
redirects) plus a memory/DoS vector (point it at a multi-GB file).

**Where:** `src/lib/fetch-metadata-server.ts:43-88`,
`src/app/api/fetch-metadata/route.ts`.

**Why it matters:** Server-side request forgery from a public endpoint is the
most attackable surface in the app once deployed.

**Fix (one task):** In `fetchMetadataServer`: (a) parse the URL, allow only
`http:`/`https:`, reject hostnames that are IP literals in private/loopback/
link-local ranges and `localhost`; (b) re-validate `res.url` after redirects
against the same rules; (c) only parse when content-type includes
`text/html`; (d) read at most ~512 KB via the body reader instead of
`res.text()`. Keep the null-on-failure contract.

---

## 4. MEDIUM-HIGH (security) — Endpoints open by default in production

**What:** `POST /api/quick-save` requires its bearer token **only if
`QUICK_SAVE_API_KEY` is set** — unset means anyone can inject links into the
library (and trigger #3's fetch on arbitrary URLs). `POST /api/categorize` is
always unauthenticated — if `OLLAMA_URL` points at a tunnel to your machine,
it's a free public relay to your LLM. `POST /api/fetch-metadata` is always
open (see #3).

**Where:** `src/app/api/quick-save/route.ts:6-15`,
`src/app/api/categorize/route.ts`, `.env.example` (documents "open is fine
for local dev").

**Fix (one task):** In production (`process.env.NODE_ENV === 'production'`),
make quick-save return 503 with a clear message when no key is configured;
apply the same bearer check to `/api/categorize`. Leave dev behavior as-is.
(`/api/fetch-metadata` is called by the browser form without a key — after #3
hardening, same-origin abuse is the residual risk; acceptable.)

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

## 6. MEDIUM — Instagram export ZIP is buffered in memory twice

**What:** `autoDetectCurrentUser()` and `parseInstagramExport()` each call
`JSZip.loadAsync(file)`, so the full ZIP is decoded into memory twice per
import session. CLAUDE.md's own pitfall list warns exports can be 100MB+ and
imports are expected to run on phones.

**Where:** `src/lib/instagram-parser.ts:39,90`,
`src/components/ImportUploader.tsx:43-60` (calls both back-to-back).

**Fix (one task):** Change both functions to accept `File | JSZip`; in
`ImportUploader.handleFile`, `await JSZip.loadAsync(file)` once and pass the
instance to both. Update the parser test (it already passes bytes directly).

---

## 7. MEDIUM — Username auto-detection can silently pick the wrong person

**What:** The current user is inferred as the participant name appearing in
the most sampled conversations, with ties broken by first insertion. With an
export containing one or two conversations, both participants tie and the
winner is effectively arbitrary. Wrong winner means the import **keeps your
own messages and drops the creator's** — inverted results with no warning.
The detected name is passed to the preview stage (`username`) but never
rendered, so the user can't catch it.

**Where:** `src/lib/instagram-parser.ts:36-76`,
`src/app/import/page.tsx:29-50` (unused `username` in preview stage),
`src/components/ImportPreview.tsx` (doesn't display it).

**Fix (one task):** In `autoDetectCurrentUser`, return `null` unless the top
name's count is ≥ 2 and strictly greater than the runner-up (falls back to
the existing manual-name prompt). In `ImportPreview`, render "Importing
messages sent **to** {username}" with a "Not you?" link that returns to the
manual-name stage.

---

## 8. MEDIUM — Swallowed errors make failures look like success across the UI

**What:** Several paths ignore the `error` half of db.ts results or drop
async failures entirely:
- `LinkCard.handleDelete` calls `deleteLink` and removes the card
  unconditionally — a failed delete vanishes from the UI and reappears on
  reload (`src/components/LinkCard.tsx:49-54`).
- `EditLinkModal.handleSave` ignores `error`; on failure the modal just stops
  spinning, silently (`src/components/EditLinkModal.tsx:52-66`).
- `getAllLinks()` and `getAllNormalizedUrls()` `break` on a mid-pagination
  error, silently returning a **partial** export / partial dedup set
  (`src/lib/db.ts:56-70,166-186`). A partial dedup set means real duplicates
  sail through import preview unmarked.
- `ImportUploader` fire-and-forgets `onParsed(...)` (typed `void`, actually
  async) — a throw in the import page's dedup step is an unhandled rejection
  and the UI sticks on the progress screen
  (`src/components/ImportUploader.tsx:26-41`, `src/app/import/page.tsx:29`).

**Fix (one task):** Make the two pagination helpers throw on error; await
`onParsed` inside the existing try/catch (change the prop type to
`Promise<void>`); check `error` in `handleDelete`/`handleSave` and show the
existing Toast/error affordances.

---

## 9. MEDIUM — Categories have two sources of truth, and the managed half is abandoned

**What:** Filter pills and colors come from the `categories` table; the value
stored on a link is free text with no FK. Typing a novel category in Quick
Save/Edit/BulkActionBar saves fine but never appears as a filter pill and
gets the fallback terracotta color. `createCategory()` exists in db.ts and is
called by nothing — the "managed categories" idea was started and dropped.

**Where:** `src/lib/db.ts:199-207` (dead `createCategory`),
`src/components/QuickSaveForm.tsx` / `EditLinkModal.tsx` /
`BulkActionBar.tsx` (free-text entry), `src/app/page.tsx` (pills from table).

**Why it matters:** Links tagged with custom categories are only reachable
via search, which quietly undermines the filter feature.

**Fix (pick one, one task either way):**
- *Managed:* after any save/update with a category not in the table, call
  `createCategory(name, colorFromSmallPalette)` — pills then always match.
- *Unmanaged (simpler):* derive pills from `SELECT DISTINCT category FROM
  links` and drop the `categories` table + `createCategory` entirely.

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
