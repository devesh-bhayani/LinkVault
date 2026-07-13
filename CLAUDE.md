# CLAUDE.md — LinkVault

Personal, single-user link library: captures resource links received in
Instagram DMs (manual quick-save, iOS Shortcut, Chrome extension, or Instagram
data-export parsing) and makes them searchable. One user, no auth, no
multi-tenancy — simplicity and speed beat scalability. Feature-complete but
**not yet deployed**; new features still being added. README is the
human-facing doc — don't duplicate it here or vice versa.

## Read these when relevant

- **[PROJECT.md](PROJECT.md)** — architecture, data flow, design decisions,
  critical paths. Read before structural changes or when "how does X fit in?"
- **[GAPS.md](GAPS.md)** — known defects and debt, severity-ordered, each with
  file paths and a scoped fix. **Check it before fixing a bug (it may be
  catalogued with a prescribed fix) and delete entries you resolve.**

## Commands

```bash
pnpm dev          # dev server on :3000
pnpm build        # production build — must pass before calling work done
pnpm test         # Vitest; colocated *.test.ts files — must pass
pnpm lint         # next lint
pnpm categorize   # backfill AI categories (local only, needs Ollama; --dry-run, --limit N)
```

Deploy target is Vercel (`vercel --prod`), but nothing is deployed yet — and
GAPS.md #2 is a deliberate pre-deployment blocker. Don't deploy casually.

## Repo map

```
src/app/          # routes: / (dashboard), /add, /import, /review + api/{fetch-metadata,categorize,quick-save}
src/components/   # all client UI ('use client' everywhere here)
src/lib/          # db.ts (ALL Supabase access), instagram-parser, url-normalize,
                  # url-extractor, export, *-server.ts modules, types.ts
scripts/          # backfill-categories.mjs (`pnpm categorize`)
extension/        # Chrome MV3 extension — separate client of POST /api/quick-save
supabase/migrations/  # schema; applied BY HAND (no runner)
```

## Rules — every session

1. **All Supabase access through `src/lib/db.ts`.** No inline
   `supabase.from(...)` in components or routes. Note db.ts is **isomorphic**:
   pages use it client-side, `/api/quick-save` uses it server-side — never add
   server-only code (fs, secrets) to it.
2. **Server-only code lives in `*-server.ts` modules** and must never be
   imported by client components; client code goes through the API routes.
3. **Optional services degrade to null, never to an error.** Ollama down →
   untagged link. Metadata fetch fails → nulls. A save must never fail because
   a nice-to-have did. Don't "fix" untagged links by making saves depend on
   Ollama.
4. **Treat the configured Supabase DB as production** — it may be the only
   copy of real data. No ad-hoc destructive SQL, bulk deletes, or scripts
   against it without asking.
5. **Schema changes = new numbered migration file** + update
   `src/lib/types.ts` in lockstep + tell the user to apply it manually.
   Never edit `001_create_tables.sql` retroactively.
6. **Mobile first.** Quick-save is used one-handed on a phone. Sanity-check
   changes to `/add`, `QuickSaveForm`, or the dashboard at ~375px.
7. **Tests cover tricky pure logic, not UI.** New parsing/normalization/dedup
   logic gets a colocated `*.test.ts`. `pnpm test` + `pnpm build` must pass.
8. **Keep dependencies tiny** (seven runtime deps). Stdlib/platform/existing
   deps before new ones.
9. **Match the style of the file you're editing.** No Prettier; semicolon use
   varies by file. Don't reformat code you aren't changing.
10. **Use the design tokens** in `tailwind.config.ts`
    (`background`/`foreground`/`accent`, `rounded-card/input/pill`,
    `shadow-card`) and the `.input`/`.btn-primary` classes from `globals.css`.
    No hardcoded hex, no new radii. (Exception: the `tag.*` palette in the
    Tailwind config is dead — tag colors come from the DB.)
11. **Don't change the `POST /api/quick-save` contract** without updating
    `extension/` — the extension and iOS Shortcut are separately-installed
    clients that break silently.

## Gotchas (things that look fine but aren't)

- **Import needs migration `002` applied.** Code is fixed (GAPS.md #1), but
  `bulkCreateLinks` upserts `onConflict: 'url'`, which needs the UNIQUE index
  from `supabase/migrations/002_unique_url.sql`. Until that's applied to the
  live DB by hand, imports fail loudly (honest error screen, not a fake
  success). Duplicate *manual* saves are handled kindly ("Already in your
  library" — GAPS.md #5), and rely on that same unique index.
- **Instagram mojibake:** every text field from an export must pass through
  `decodeInstagramText()` (`instagram-parser.ts`) or emoji/quotes corrupt.
  Tests author fixtures with the inverse helper `toInstagramMojibake()`.
- **URLs live in TWO places** in export messages: `content` text AND
  `share.link`. Extract from both. Own messages are skipped via the detected
  display name; sender handle comes from `thread_path`.
- **Supabase RLS must stay OFF** on `links`/`categories` (or get explicit
  policies). RLS on + no policy = every query silently returns empty — looks
  exactly like a bug in the app.
- **Dedup is two-layered and import-only:** exact (trailing-slash trim + url
  equality) and fuzzy (`normalizeUrl()` — strips tracking params, `www.`,
  fragments, sorts query params). Manual quick-saves don't fuzzy-dedup, but a
  DB unique index rejects exact-URL dupes and `createLink` reports them as
  "already saved" (GAPS.md #5).
- **Ollama is unreachable from serverless.** On Vercel, tagging no-ops by
  design; `pnpm categorize` backfills locally. Tunnel via `OLLAMA_URL` for
  real-time tagging.
- **The category list has THREE live copies** that must stay in sync:
  migration seed, `src/lib/categorize-server.ts` `CATEGORIES`, and
  `scripts/backfill-categories.mjs` `CATEGORIES`.
- **Categories aren't really managed:** filter pills come from the
  `categories` table but `links.category` is free text — custom tags never
  show as pills (GAPS.md #9).
- **Metadata fetching is server-side only** (CORS). 5s timeout, nulls on
  failure. Currently lacks SSRF hardening — see GAPS.md #3 before exposing.
- **`updated_at` is set in app code** (db.ts update helpers), not a trigger.
- **Export ZIPs can be 100MB+** and are parsed in-browser; keep memory in
  mind (currently loaded twice — GAPS.md #6).
- **App Router:** everything in `src/components/` is `'use client'`; server
  components are only the thin page shells like `/add`.

## Generated / hands-off files

- `next-env.d.ts`, `tsconfig.tsbuildinfo`, `.next/` — generated, gitignored,
  never edit.
- `pnpm-lock.yaml` — changes only via pnpm commands, never by hand.
- `.env.local` — real secrets; never commit, never print. `.env.example` is
  the documented reference (Supabase vars required; `OLLAMA_URL`,
  `OLLAMA_MODEL`, `QUICK_SAVE_API_KEY` optional — features degrade
  gracefully without them).

## Mistakes to avoid

- Rewriting/reformatting working code the task didn't ask you to touch.
- Adding dependencies, abstraction layers, or "for later" scaffolding to a
  single-user tool.
- Editing an existing migration instead of adding a new one.
- Shipping something desktop-tested that breaks the phone quick-save flow.
- Letting an optional service (Ollama, metadata) become a hard dependency of
  the save path.
- Trusting a green UI message as proof a write succeeded — several paths
  swallow errors today (GAPS.md #1, #8). Verify against the DB when it
  matters.
