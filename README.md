# LinkVault

A personal link library for resources received in Instagram DMs. Creators ask
you to comment a keyword on a Reel, then DM you a link (PDF, course, template,
tool…) — and those links get buried in your inbox within days. LinkVault
captures, tags, and makes every one of them searchable.

It's a single-user tool. No auth, no multi-tenancy — simplicity and speed over
scale.

## Features

- **Quick Save** — paste a URL; the title/description are auto-fetched and a
  category is suggested. `⌘/Ctrl + Enter` to save. Mobile-first.
- **Library + search** — full-text search across title, URL, notes, tags, and
  sender; filter by category; bulk tag/read/delete.
- **Instagram export parser** — upload your Instagram data export ZIP; it
  extracts every link received from others (handles Instagram's mojibake
  encoding and both `content` + `share.link` fields), fuzzy-deduped against
  what you already have.
- **AI categorization** — links are auto-tagged by a local **Ollama** model
  (see [AI categorization](#ai-categorization) for how this works in production).
- **Review queue** — resurfaces unread links so you actually use what you saved.
- **CSV / JSON export** of the whole library.
- **External quick-save endpoint** (`POST /api/quick-save`) used by the
  [iOS Shortcut](#ios-shortcut) and [browser extension](#browser-extension).

## Tech stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Supabase (Postgres) ·
JSZip · Ollama (local LLM) · deployed on Vercel.

## Setup

```bash
pnpm install
cp .env.example .env.local   # then fill in the values
```

### 1. Database

Run the files in `supabase/migrations/` **in order** against your Supabase
project (SQL editor, or `supabase db push`): `001` creates the tables, FTS
column, and seed categories; `002` dedupes and enforces URL uniqueness; `003`
enables Row-Level Security with signed-in-only policies.

Before applying `003`: create your (single) account in the Supabase dashboard
— Authentication → Add user, with **Auto Confirm** checked — and put your
service role key in `.env.local` (see below). Once `003` is applied, the app
shows a sign-in screen and anonymous DB access silently returns nothing.

### 2. Environment

See `.env.example`. Supabase URL + anon key are required, and
`SUPABASE_SERVICE_ROLE_KEY` is needed once RLS is enabled (it's used only
server-side by the quick-save endpoint and the categorize script — never
expose it in the browser). The Ollama and quick-save keys are optional.

### 3. Run

```bash
pnpm dev      # http://localhost:3000
pnpm build    # production build
pnpm test     # run the test suite (Vitest)
```

## AI categorization

Categorization uses a **local Ollama** model (`qwen3:8b` by default), not a paid
API — free and private. Because tagging happens server-side, where it runs
depends on your deployment:

- **Local / self-hosted** — with `ollama serve` running, links are tagged in
  real time as you save them.
- **Vercel (or any serverless host)** — the functions can't reach your laptop's
  `localhost:11434`, so saving still works but links land **untagged**. Two ways
  to get tags:

  1. **Batch backfill (recommended).** Run this on your machine whenever you
     like — it finds every untagged link and categorizes it against your local
     Ollama:

     ```bash
     pnpm categorize             # tag everything untagged
     pnpm categorize --dry-run   # preview, change nothing
     pnpm categorize --limit 50  # cap the batch
     ```

  2. **Real-time via a tunnel.** Expose your local Ollama with a Cloudflare
     Tunnel or Tailscale and set `OLLAMA_URL` to that address — then the
     deployed app tags on save too. (Requires your machine to be on/reachable.)

First time: `ollama pull qwen3:8b` (or set `OLLAMA_MODEL` to a model you have).

## iOS Shortcut

`POST /api/quick-save` lets you save from anywhere. Build a Shortcut that takes
the shared URL and sends:

```
POST  https://<your-app>/api/quick-save
Header: Authorization: Bearer <QUICK_SAVE_API_KEY>
Body (JSON): { "url": "<shared url>" }
```

The server auto-fetches the title/description and categorizes (if Ollama is
reachable). If `QUICK_SAVE_API_KEY` is unset the endpoint is open.

## Browser extension

A Chrome (MV3) "Save to LinkVault" extension lives in [`extension/`](./extension).
Load it unpacked and point it at your app URL + key — see
[`extension/README.md`](./extension/README.md).

## Project structure

```
src/
├── app/            # routes: / (dashboard), /add, /import, /review, /api/*
├── components/     # UI: QuickSaveForm, LinkCard, SearchBar, ImportUploader, …
└── lib/            # supabase client, db queries, instagram-parser, url utils,
                    # categorize-server (Ollama), metadata fetcher, export
scripts/
└── backfill-categories.mjs   # `pnpm categorize` — local batch tagging
extension/          # Chrome MV3 extension
supabase/migrations # schema
```

Tests live next to the code they cover (`*.test.ts`) and run with `pnpm test`.
