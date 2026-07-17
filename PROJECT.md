# PROJECT.md — LinkVault, explained to a new engineer

*Written 2026-07-07 as a one-time knowledge transfer after a full read of every
file in the repository. Architecture and narrative live here; operational
rules live in CLAUDE.md; known defects live in GAPS.md.*

## What this is

LinkVault is a **single-user personal tool** for one specific problem:
Instagram creators say "comment KEYWORD and I'll DM you the link," and those
DM'd resource links (PDFs, courses, Notion templates, tools) get buried in the
Instagram inbox within days. LinkVault is the searchable library those links
go into.

It is built by and for one person (the repo owner). There is deliberately no
sign-up, no user accounts, no multi-tenancy. Every design decision favors
"fast and simple for one person" over "correct for many." As of July 2026 the
app is feature-complete against its original spec but **not yet deployed or in
daily use** — it runs locally via `pnpm dev`, with Vercel as the intended
deploy target. Features are still being added.

Links enter the system four ways, all funneling into one `links` table:

1. **Quick Save form** (`/add`) — paste a URL, title/description auto-fetch,
   a category is AI-suggested, save. The flagship flow; optimized for phones.
2. **Instagram export import** (`/import`) — upload the ZIP Instagram gives
   you from Settings → Download Your Information. Parsed entirely in the
   browser; links received from other people are extracted, deduped, and
   batch-inserted after a preview.
3. **`POST /api/quick-save`** — an external endpoint for the iOS Shortcut and
   the bundled Chrome extension (`extension/`). Send a URL, the server does
   the rest.
4. *(Consumption side)* the dashboard (`/`), a review queue of unread links
   (`/review`), full-text search, category filters, bulk editing, CSV/JSON
   export.

## Tech stack and why

| Piece | Why it's here |
|---|---|
| **Next.js 14, App Router** | One framework gives pages + the three API routes; file-based routing; free Vercel deploys. No separate backend exists or is wanted. |
| **TypeScript, strict** | Types in `src/lib/types.ts` mirror the DB schema; that's the extent of the type ceremony. |
| **Supabase (Postgres)** | The entire backend. Free tier, JS client callable straight from the browser, built-in full-text search via a generated `tsvector` column. Chosen so the app needs no API layer of its own. |
| **Tailwind CSS** | Utility styling with a small custom theme (warm off-white + terracotta, generous radii). Two shared component classes (`.input`, `.btn-primary`) in `globals.css`. |
| **JSZip** | Instagram exports are ZIPs; parsing happens client-side so a 100MB export never has to be uploaded anywhere. |
| **Ollama (optional)** | Local LLM (`qwen3:8b`) auto-suggests a category for new links. Chosen over a paid API for privacy and cost — with the accepted tradeoff that a serverless deploy can't reach it (see "Tagging pipeline"). |
| **date-fns, lucide-react** | Relative timestamps and icons. That's the whole dependency story — seven runtime deps total, kept deliberately small. |
| **Vitest** | Colocated `*.test.ts` unit tests for the tricky pure logic only. |

## Architecture

The defining decision: **there is no application server.** Pages are client
components that talk to Supabase directly from the browser using the public
anon key. The three Next.js API routes exist only for things a browser
cannot do (cross-origin fetches, reaching Ollama, accepting external saves).

```
Browser (all pages are client-rendered)
│
├─ /            dashboard: search + filter + bulk edit + export
├─ /review      unread queue ("Open & Done")
├─ /add         QuickSaveForm
├─ /import      ImportUploader → instagram-parser (JSZip, in-browser) → ImportPreview
│
│        all data access goes through one module:
└──────► src/lib/db.ts ───────────────► Supabase Postgres
                ▲                        (links, categories, FTS column;
                │                         RLS ON — authenticated policies;
                │                         browser signs in via AuthGate,
                │                         server uses the service role key)
Server (Next.js API routes)
├─ POST /api/fetch-metadata ─► fetch-metadata-server.ts ─► target website
├─ POST /api/categorize ─────► categorize-server.ts ─────► Ollama (localhost or tunnel)
└─ POST /api/quick-save ─────► both of the above + db.createLink
                ▲
External clients│
├─ Chrome MV3 extension (extension/) — context menu + popup
└─ iOS Shortcut (user-built, per README)

Local machine, out-of-band:
└─ scripts/backfill-categories.mjs (`pnpm categorize`) ─► Supabase + Ollama
```

Notable consequence: `src/lib/db.ts` is **isomorphic**. Every page imports it
client-side, but `/api/quick-save` imports the same module server-side. It
works in both places because the Supabase client is constructed from
`NEXT_PUBLIC_*` env vars, which are available in both bundles.

### Data model

One load-bearing table, one satellite:

- **`links`** — url, title, description (doubles as user notes), category
  (free text), source (`'manual' | 'instagram_export'`), sender metadata and
  original timestamp (populated only by imports), `is_read` (drives the
  review queue), timestamps. A generated `fts` tsvector column concatenates
  title/description/category/sender/url; searches use
  `.textSearch('fts', q, { type: 'websearch' })`.
- **`categories`** — a seeded list of eight names + hex colors. It drives the
  filter pills and tag colors. NB: `links.category` is free text and is *not*
  foreign-keyed to this table — the two can and do drift (see GAPS.md #9).

Schema lives in `supabase/migrations/001_create_tables.sql` and must be
applied by hand (SQL editor or `supabase db push`); there is no migration
runner.

### The import pipeline (most complex code in the repo)

`ImportUploader` → `autoDetectCurrentUser()` samples up to 30 conversation
files and picks the participant name that appears most often (the logged-in
user is in every conversation). If detection fails, the user types their
display name. → `parseInstagramExport()` walks every
`messages/inbox/**/*.json`, decodes Instagram's mojibake, extracts URLs from
both message text and `share.link` fields, skips messages the user sent,
derives the sender handle from `thread_path`, and dedupes within the export.
→ The import page fuzzy-dedupes against the whole DB by comparing
`normalizeUrl()` forms. → `ImportPreview` shows new vs duplicate, user
confirms → `bulkCreateLinks()` upserts.

**Know before you touch it:** that final upsert is currently broken at the
database level and the failure is masked by a fake success screen — GAPS.md
item #1 has the full chain. Do not build on the import-confirm path without
fixing that first.

### The tagging pipeline

Category suggestions come from a local Ollama model with a strict
"reply with only the category name" prompt at temperature 0, validated
against a fixed list. Three call sites: the Quick Save form (via
`/api/categorize`), the quick-save endpoint (directly), and the batch
backfill script. All three **fail soft to `null`** — an unreachable Ollama
never blocks a save; the link just lands untagged.

Because Vercel functions can't reach `localhost:11434`, the intended
production workflow is: links save untagged, then `pnpm categorize` runs
locally against your own Ollama to backfill (`--dry-run` and `--limit`
supported). A tunnel (Cloudflare/Tailscale) via `OLLAMA_URL` enables
real-time tagging instead.

The category list is duplicated in three live places that must stay in sync:
the migration seed, `src/lib/categorize-server.ts`, and
`scripts/backfill-categories.mjs`. (A fourth copy in `tailwind.config.ts`
(`tag.*` colors) is dead — real tag colors come from the DB.)

### Duplicate detection (two layers)

- **Exact:** URLs are trailing-slash-trimmed; `getExistingUrls()` checks raw
  equality; `bulkCreateLinks` upserts on `url`.
- **Fuzzy:** `normalizeUrl()` (`src/lib/url-normalize.ts`) lowercases the
  host, strips `www.`, fragments, trailing slashes, and tracking params
  (`utm_*`, `fbclid`, `igshid`, …), and sorts remaining query params. Used to
  flag "already saved" in import preview.

Fuzzy dedup runs **only in the import flow**. Manual quick-saves do no
duplicate checking at all — saving the same URL twice makes two rows.

## Key design decisions (inferred, with reasoning)

1. **Supabase-as-the-backend, browser-direct access.** Eliminates an entire
   API layer for a single-user tool. Secured (since GAPS.md #2 was fixed) by
   RLS with authenticated-only policies plus a single Supabase Auth account:
   the browser signs in through `AuthGate`, API routes write via the
   service-role key.
2. **All DB access behind `db.ts`.** Components never write inline queries.
   Every helper returns `{ data, error }` Supabase-style rather than
   throwing; callers decide what failure means (several forget to — GAPS.md #8).
3. **Graceful degradation over hard dependencies.** Metadata fetch and AI
   tagging return nulls on any failure. A save must never fail because a
   nice-to-have did. This is the most consistently applied principle in the
   codebase.
4. **Client-side ZIP parsing.** Privacy (DMs never leave the machine) and no
   server infrastructure for 100MB uploads. Cost: memory pressure on phones
   (GAPS.md #6).
5. **Tests only where logic is subtle and pure.** Parser (with a clever
   mojibake round-trip helper), URL extraction, URL normalization. UI, db
   wrappers, and API routes are untested — accepted risk for a personal tool,
   though it demonstrably let the import bug through.
6. **Optimistic, local state updates.** After edits/deletes, pages patch
   their in-memory `links` array rather than refetching. Snappy, and mostly
   correct because there's exactly one user.

## Critical paths vs. safe-to-change

**Load-bearing — change with care and run `pnpm test`:**
- `src/lib/instagram-parser.ts` — encoding, own-message filtering, dual URL
  extraction. Subtle; has the best test coverage in the repo for a reason.
- `src/lib/url-normalize.ts` — dedup correctness for every future import.
- `src/lib/db.ts` — every feature flows through it, client and server.
- The `POST /api/quick-save` request/response contract — the Chrome
  extension (`extension/background.js`, `popup.js`) and any iOS Shortcut are
  external, separately-installed clients that will silently break.
- `supabase/migrations/` + `src/lib/types.ts` — must move in lockstep, and
  the live DB only changes when someone applies SQL by hand.

**Safe to change casually:**
- Everything in `src/components/` — pure presentation over props + `db.ts`
  calls. No hidden coupling except the props flowing from pages.
- Page layout/copy, `globals.css`, Tailwind theme values.
- `EmptyState`, `Toast`, `Navbar`, skeletons — cosmetic.

## Things that will trip up someone new

- **Instagram mojibake.** Export JSON stores UTF-8 bytes as Latin-1 code
  points. Any text field read from an export must pass through
  `decodeInstagramText()`. The test file's `toInstagramMojibake()` helper is
  the inverse — use it when writing parser tests.
- **RLS is on, and its failure mode is silence.** With migration `003`
  applied, an anonymous (signed-out, or missing service key) client gets
  empty arrays with no error — it looks exactly like a data-loss bug. Check
  the session before debugging "missing" data.
- **The import success screen lies right now.** See GAPS.md #1 before
  concluding an import worked.
- **`db.ts` runs in the browser.** Don't add server-only code (fs, secrets)
  to it; server-only logic goes in `*-server.ts` modules, which client code
  must never import.
- **Categories look managed but aren't.** The pills come from the
  `categories` table; the value on a link is free text. A custom-typed tag
  saves fine but never appears as a filter pill.
- **`updated_at` is set by application code** (`new Date().toISOString()` in
  the update helpers), not by a DB trigger. Bypass `db.ts` and it silently
  stays stale.
- **No Prettier, mixed semicolons.** Roughly half the files use semicolons.
  Match the file you're in; don't reformat.
- **Deleting is instant and permanent.** No soft delete, no undo, and the
  single-card delete doesn't even confirm (bulk delete does).
