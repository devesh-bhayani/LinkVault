# CLAUDE.md — LinkVault: Project Context & PRD

> **What this file is:** This is the single source of truth for Claude Code when working on the LinkVault project. It contains the full product vision, architecture, data models, tech decisions, file structure, and implementation guidance. Read this file completely before starting any task.

---

## 1. PRODUCT OVERVIEW

### What is LinkVault?

LinkVault is a **personal productivity tool** that solves a specific problem: when Instagram creators ask followers to comment a keyword on their Reels and then DM them a resource link (PDF, course, tool, guide, etc.), those links get buried in the Instagram DM inbox and are effectively lost within days.

LinkVault captures, organizes, and makes searchable every resource link received through Instagram DMs — so the user can find and use them whenever they actually need them.

### Who is this for?

A single user (the developer themselves). This is a **personal tool**, not a multi-tenant SaaS. Design decisions should favor simplicity and speed over scalability. There is no authentication system needed beyond basic environment-level security. If the project evolves into a multi-user product later, that's a future concern — not a current one.

### Core User Story

> "As an Instagram user, I receive dozens of resource links in my DMs from creators every week. I want a single place where all those links are stored, tagged, and searchable — so I can actually find and use them when I need to."

---

## 2. HOW IT WORKS — TWO INPUT METHODS

LinkVault has **two ways** to capture links. Both feed into the same database.

### Input Method A: Quick Save (Real-time, Manual)

The user receives a link in an Instagram DM. They copy the link, open the LinkVault web app (or use a mobile shortcut / bookmarklet), paste the link, optionally add a title and category tag, and save. This takes ~10 seconds and ensures important links are captured the moment they arrive.

**This is the primary input method and should be the most frictionless experience in the entire app.**

### Input Method B: Instagram Data Export Parser (Batch, Periodic)

Instagram allows users to download their data as a ZIP file containing JSON files with all their messages. The user requests this export from Instagram (Settings → Your Activity → Download Your Information → Messages → JSON format), downloads the ZIP, and uploads it to LinkVault. A parser script then:

1. Extracts the ZIP
2. Reads all message JSON files
3. Finds every URL in every message using regex
4. Extracts context: sender username, timestamp, surrounding message text
5. De-duplicates against existing links in the database
6. Adds all new links to the database

**This is the safety net** — run monthly to catch any links the user didn't manually quick-save.

---

## 3. FEATURES — PRIORITIZED

### P0 — Must Have (Phase 1)

- **Quick Save form**: A clean, minimal form with fields for URL (required), Title (optional, auto-fetched from URL if possible), Category/Tag (optional, selectable or free-text), and Notes (optional). Saving should feel instant.
- **Link library / dashboard**: A page showing all saved links in reverse chronological order. Each link card shows: title, URL (clickable), category tag, source (manual save or Instagram export), date saved, and any notes.
- **Search**: Full-text search across title, URL, notes, tags, and sender name. Search should be fast and prominent — this is the #1 reason the tool exists.
- **Filter by category**: Dropdown or sidebar filter to show only links matching a selected category tag.
- **Responsive design**: Must work well on mobile (since the user will often save links directly from their phone while browsing Instagram).

### P1 — Should Have (Phase 2)

- **Instagram export uploader + parser**: A page where the user can upload their Instagram data export ZIP file. The app processes it in the browser or on the server, extracts all URLs from DM messages, shows a preview of discovered links, and lets the user confirm before adding to the database.
- **Auto-fetch metadata**: When a URL is saved, automatically fetch the page title and meta description (via server-side fetch or a metadata API) to populate the title and description fields.
- **Bulk tag editor**: Select multiple links and apply/remove tags in bulk.
- **Export**: Export all links as CSV or JSON.

### P2 — Nice to Have (Phase 3)

- **AI auto-categorization**: When a link is saved, use an LLM (Claude API) to read the link's title/description and auto-suggest a category tag (e.g., "Coding Tutorial", "Design Resource", "Free PDF", "Career Advice", "Finance", etc.).
- **Duplicate detection with fuzzy matching**: Warn if a similar URL (not just exact match) already exists.
- **Browser extension**: A lightweight Chrome extension that adds a "Save to LinkVault" option when right-clicking a link on Instagram's web interface.
- **Reminders / Review queue**: Surface unseen links periodically to remind the user to actually use what they saved.

---

## 4. TECH STACK

### Decision Rationale

The user is building this as a personal project and wants to use Claude Code for development. The stack should be modern, well-documented (so Claude Code can work with it effectively), and deployable for free or near-free.

### Chosen Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| **Frontend** | Next.js 14+ (App Router) | React-based, file-based routing, API routes built-in, great DX |
| **Styling** | Tailwind CSS | Utility-first, fast iteration, great for responsive design |
| **Database** | Supabase (PostgreSQL) | Free tier generous, real-time subscriptions, built-in auth if needed later, REST + JS client |
| **File parsing** | Client-side JS (JSZip + custom parser) | Avoids needing a heavy backend for ZIP processing |
| **Metadata fetching** | Next.js API route (server-side) | Fetch URL metadata server-side to avoid CORS issues |
| **AI categorization** | Anthropic Claude API (optional, Phase 3) | Auto-tag links by analyzing page title + description |
| **Deployment** | Vercel | Free tier, native Next.js support, zero-config |
| **Package manager** | pnpm | Fast, disk-efficient |

### Key Dependencies

```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "@supabase/supabase-js": "^2.0.0",
    "jszip": "^3.10.0",
    "tailwindcss": "^3.4.0",
    "lucide-react": "latest",
    "date-fns": "^3.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/react": "^18.0.0",
    "@types/node": "^20.0.0",
    "eslint": "^8.0.0",
    "eslint-config-next": "^14.0.0"
  }
}
```

---

## 5. DATA MODEL

### Table: `links`

This is the primary (and initially only) table.

```sql
CREATE TABLE links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT,                          -- Page title (manual or auto-fetched)
  description TEXT,                    -- Short description or notes
  category TEXT,                       -- Tag / category label (e.g., "Coding", "Design", "Finance")
  source TEXT DEFAULT 'manual',        -- 'manual' | 'instagram_export'
  sender_username TEXT,                -- Instagram username who sent the link (from export)
  sender_message_context TEXT,         -- Surrounding message text for context (from export)
  original_timestamp TIMESTAMPTZ,      -- When the DM was originally sent (from export)
  is_read BOOLEAN DEFAULT FALSE,       -- Has the user actually visited/used this link?
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for search and filtering
CREATE INDEX idx_links_category ON links(category);
CREATE INDEX idx_links_created_at ON links(created_at DESC);
CREATE INDEX idx_links_url ON links(url);

-- Full-text search index
ALTER TABLE links ADD COLUMN fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(description, '') || ' ' || COALESCE(category, '') || ' ' || COALESCE(sender_username, '') || ' ' || url)
  ) STORED;

CREATE INDEX idx_links_fts ON links USING GIN(fts);
```

### Table: `categories` (optional, for managed category list)

```sql
CREATE TABLE categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT,                          -- Hex color for UI tag display
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with default categories
INSERT INTO categories (name, color) VALUES
  ('Coding', '#3B82F6'),
  ('Design', '#8B5CF6'),
  ('Finance', '#10B981'),
  ('Career', '#F59E0B'),
  ('Free PDF', '#EF4444'),
  ('Course', '#EC4899'),
  ('Tool', '#6366F1'),
  ('Other', '#6B7280');
```

---

## 6. FILE / FOLDER STRUCTURE

```
linkvault/
├── CLAUDE.md                          # THIS FILE — project context for Claude Code
├── README.md                          # Standard readme
├── package.json
├── pnpm-lock.yaml
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── .env.local                         # NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
├── supabase/
│   └── migrations/
│       └── 001_create_tables.sql      # SQL from Section 5 above
├── src/
│   ├── app/
│   │   ├── layout.tsx                 # Root layout with font imports and global providers
│   │   ├── page.tsx                   # Dashboard / link library (home page)
│   │   ├── add/
│   │   │   └── page.tsx               # Quick Save form page
│   │   ├── import/
│   │   │   └── page.tsx               # Instagram export upload + parser page
│   │   └── api/
│   │       └── fetch-metadata/
│   │           └── route.ts           # API route: given a URL, fetch its title + description
│   ├── components/
│   │   ├── LinkCard.tsx               # Individual link display card
│   │   ├── LinkList.tsx               # List/grid of LinkCards with loading states
│   │   ├── SearchBar.tsx              # Search input with debounced query
│   │   ├── CategoryFilter.tsx         # Category tag filter (pills or dropdown)
│   │   ├── QuickSaveForm.tsx          # The main form for adding a link manually
│   │   ├── ImportUploader.tsx         # ZIP file upload + processing UI
│   │   ├── ImportPreview.tsx          # Preview of extracted links before confirming import
│   │   ├── Navbar.tsx                 # Top navigation bar
│   │   ├── EmptyState.tsx             # Shown when no links exist yet
│   │   └── Toast.tsx                  # Simple toast notification component
│   ├── lib/
│   │   ├── supabase.ts               # Supabase client initialization
│   │   ├── types.ts                   # TypeScript types (Link, Category, etc.)
│   │   ├── instagram-parser.ts        # Core logic: parse Instagram export ZIP → extract links
│   │   ├── url-extractor.ts           # Regex utility to find all URLs in a string
│   │   └── metadata-fetcher.ts        # Client-side helper to call the /api/fetch-metadata endpoint
│   └── styles/
│       └── globals.css                # Tailwind base + any custom CSS
```

---

## 7. KEY IMPLEMENTATION DETAILS

### 7.1 Instagram Export Parser (`lib/instagram-parser.ts`)

This is the most complex piece. Here's exactly how Instagram structures the export:

**Instagram data export structure (JSON format):**
```
your_instagram_activity/
├── messages/
│   └── inbox/
│       ├── username1_datestring/
│       │   └── message_1.json
│       ├── username2_datestring/
│       │   └── message_1.json
│       │   └── message_2.json    (if conversation is long, split into multiple files)
│       └── ...
```

**Each `message_N.json` file has this structure:**
```json
{
  "participants": [
    { "name": "Your Name" },
    { "name": "Other Person" }
  ],
  "messages": [
    {
      "sender_name": "Other Person",
      "timestamp_ms": 1700000000000,
      "content": "Here\u00e2\u0080\u0099s the link: https://example.com/resource.pdf",
      "type": "Generic"
    },
    {
      "sender_name": "Other Person",
      "timestamp_ms": 1699999000000,
      "share": {
        "link": "https://example.com/another-resource",
        "share_text": "Check this out"
      },
      "type": "Share"
    }
  ],
  "title": "Other Person",
  "is_still_participant": true,
  "thread_path": "inbox/username1_20231115"
}
```

**Important parsing notes:**
- Instagram encodes special characters weirdly — the JSON uses **mojibake** (broken UTF-8 encoded as Latin-1). You MUST decode text fields by converting each character's code point to a byte and then decoding the byte array as UTF-8. Example decoder:

```typescript
function decodeInstagramText(text: string): string {
  try {
    const bytes = new Uint8Array(text.split('').map(c => c.charCodeAt(0)));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return text; // Return original if decoding fails
  }
}
```

- URLs can appear in two places: embedded in `content` (as plain text) and in the `share.link` field. Extract from BOTH.
- The parser must handle multiple `message_N.json` files per conversation (they're split when conversations are long).
- Ignore messages sent BY the user themselves — only extract links received FROM others. The user's own name can be inferred from `participants` (it appears in every conversation).

**URL extraction regex:**
```typescript
const URL_REGEX = /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;
```

**Parser output type:**
```typescript
interface ExtractedLink {
  url: string;
  senderUsername: string;
  messageContext: string;       // The full message text containing the link
  originalTimestamp: Date;
  source: 'instagram_export';
}
```

### 7.2 Quick Save Form (`components/QuickSaveForm.tsx`)

**UX Requirements:**
- URL field is the ONLY required field. It should be auto-focused on page load.
- When the user pastes a URL and tabs out (or after a 500ms debounce), automatically call `/api/fetch-metadata` to get the page title and description. Pre-fill the Title field with the result.
- Category should be a combobox: show existing categories as selectable options, but allow typing a new one.
- "Save" button should be large and obvious. After saving, show a success toast and clear the form (but keep the page — don't redirect).
- Add a keyboard shortcut: `Cmd+Enter` / `Ctrl+Enter` to save.

### 7.3 Metadata Fetcher API Route (`app/api/fetch-metadata/route.ts`)

```typescript
// POST /api/fetch-metadata
// Body: { url: string }
// Response: { title: string | null, description: string | null, favicon: string | null }

// Implementation: Use fetch() to GET the URL server-side, parse the HTML to extract:
// - <title> tag content
// - <meta name="description"> content
// - <link rel="icon"> href
// Use a timeout of 5 seconds. If fetch fails, return nulls gracefully.
// Set a reasonable User-Agent header to avoid blocks.
```

### 7.4 Search Implementation

Use Supabase's full-text search via the `fts` tsvector column:

```typescript
// For search queries:
const { data } = await supabase
  .from('links')
  .select('*')
  .textSearch('fts', searchQuery, { type: 'websearch' })
  .order('created_at', { ascending: false });

// For category filter:
const { data } = await supabase
  .from('links')
  .select('*')
  .eq('category', selectedCategory)
  .order('created_at', { ascending: false });

// Combined:
let query = supabase.from('links').select('*');
if (searchQuery) query = query.textSearch('fts', searchQuery, { type: 'websearch' });
if (category) query = query.eq('category', category);
query = query.order('created_at', { ascending: false });
```

### 7.5 Dashboard / Home Page (`app/page.tsx`)

**Layout:**
- Top: Navbar with app name "LinkVault" and navigation (Dashboard, Quick Save, Import)
- Below navbar: Search bar (full width, prominent) + Category filter pills
- Main content: Grid or list of LinkCards
- Empty state: Friendly illustration + "Save your first link" CTA when no links exist
- Each LinkCard shows: favicon (if available), title (or URL if no title), truncated URL, category tag (colored pill), relative date ("2 days ago"), and a small menu with Edit / Delete / Mark as Read / Open Link options

**Behavior:**
- Initial load: Fetch most recent 50 links, ordered by `created_at DESC`
- Search: Debounced (300ms), triggers new query on each keystroke
- Category filter: Clicking a category pill filters immediately; clicking again deselects
- Infinite scroll or "Load more" button for pagination

---

## 8. DESIGN DIRECTION

### Visual Style

Clean, warm, slightly editorial. Think: Notion meets a personal bookmarks app. NOT a corporate dashboard.

- **Color palette**: Warm neutrals with a terracotta/rust accent. Background: `#FAF8F5` (warm off-white). Primary text: `#1A1714`. Accent: `#C45D3E` (terracotta). Category tags: Each gets its own soft pastel color.
- **Typography**: Use a clean sans-serif for body (DM Sans or similar from Google Fonts). Consider a serif for headings (optional).
- **Border radius**: Generous — `12px` for cards, `8px` for inputs, `20px` for pills/tags.
- **Spacing**: Generous padding and whitespace. Don't cram things together.
- **Shadows**: Subtle, warm-toned shadows (`rgba(26, 23, 20, 0.06)`).

### Mobile-First

The Quick Save page especially MUST be optimized for mobile. The user will most often use this directly after receiving a link on their phone. Large tap targets, no tiny buttons, the URL input should be immediately visible without scrolling.

---

## 9. ENVIRONMENT VARIABLES

```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# Optional (Phase 3 — AI categorization)
ANTHROPIC_API_KEY=sk-ant-...
```

---

## 10. DEVELOPMENT COMMANDS

```bash
# Install dependencies
pnpm install

# Run dev server
pnpm dev

# Build for production
pnpm build

# Run Supabase migrations (if using Supabase CLI)
supabase db push

# Deploy to Vercel
vercel --prod
```

---

## 11. IMPLEMENTATION ORDER

When building this project, follow this exact sequence:

### Step 1: Project scaffold
Initialize Next.js with TypeScript + Tailwind. Set up folder structure as described in Section 6. Configure Supabase client. Run database migrations.

### Step 2: Data layer
Create `lib/types.ts` with all TypeScript interfaces. Create `lib/supabase.ts` with client initialization. Test basic CRUD operations against the `links` table.

### Step 3: Quick Save form
Build the `QuickSaveForm` component and the `/add` page. This is the most important user-facing feature. Make sure it works perfectly on mobile. Wire up to Supabase insert.

### Step 4: Dashboard
Build the home page with `LinkList`, `LinkCard`, `SearchBar`, and `CategoryFilter`. Implement search using Supabase full-text search. Add the empty state.

### Step 5: Metadata fetcher
Build the `/api/fetch-metadata` API route. Integrate it into the Quick Save form so titles are auto-populated.

### Step 6: Navigation + polish
Build the `Navbar`. Add toast notifications for save/delete actions. Polish responsive design. Add edit and delete functionality for links.

### Step 7: Instagram export parser
Build `lib/instagram-parser.ts` and `lib/url-extractor.ts`. Build the `/import` page with `ImportUploader` and `ImportPreview` components. This is the most complex feature — take care with the Instagram JSON encoding issues.

### Step 8: Final polish
Add loading skeletons, error handling, 404 page, favicon, and meta tags. Test the full flow end-to-end.

---

## 12. TESTING THE INSTAGRAM PARSER

Since you may not have an Instagram export ready, here's a mock data structure you can use for testing:

```json
{
  "participants": [
    { "name": "Test User" },
    { "name": "creator_account" }
  ],
  "messages": [
    {
      "sender_name": "creator_account",
      "timestamp_ms": 1710000000000,
      "content": "Thanks for commenting! Here\u00e2\u0080\u0099s your free resource: https://example.com/free-guide.pdf",
      "type": "Generic"
    },
    {
      "sender_name": "creator_account",
      "timestamp_ms": 1709999000000,
      "share": {
        "link": "https://notion.so/some-template-12345",
        "share_text": "Free Notion template"
      },
      "type": "Share"
    },
    {
      "sender_name": "Test User",
      "timestamp_ms": 1709998000000,
      "content": "Thank you!",
      "type": "Generic"
    }
  ],
  "title": "creator_account",
  "is_still_participant": true,
  "thread_path": "inbox/creator_account_20240310"
}
```

The parser should extract 2 links from this: the one in `content` and the one in `share.link`. It should NOT extract anything from "Test User" messages (those are the current user's own messages).

---

## 13. COMMON PITFALLS TO AVOID

1. **Instagram text encoding**: The JSON export uses broken UTF-8 (mojibake). Always run text through the `decodeInstagramText()` function from Section 7.1.
2. **CORS on metadata fetch**: You CANNOT fetch arbitrary URLs from the browser. The metadata fetcher MUST be a server-side API route.
3. **Supabase row-level security**: If RLS is enabled on the `links` table, you need to either disable it (acceptable for a personal tool) or set up a policy. For simplicity, start with RLS disabled.
4. **URL deduplication**: Before inserting from an Instagram export, always check if the URL already exists in the database. Use exact URL match (after trimming trailing slashes).
5. **Large exports**: Instagram export ZIPs can be 100MB+. Process files one at a time using streaming/chunked reading via JSZip, not by loading the entire ZIP into memory at once.
6. **Next.js App Router**: This project uses the App Router (not Pages Router). All components in `app/` are Server Components by default. Add `'use client'` directive to any component that uses React hooks (useState, useEffect, etc.) or browser APIs.

---

## 14. SUMMARY

LinkVault is a personal link library powered by two input methods: manual quick-save and Instagram export parsing. The tech stack is Next.js + Supabase + Tailwind, deployed on Vercel. The most important feature is the Quick Save form — it must be fast and mobile-friendly. The Instagram parser is the most complex feature — pay special attention to the JSON encoding issues and the dual URL extraction paths (content text + share.link field).

Build in the order specified in Section 11. When in doubt, favor simplicity. This is a personal tool — it doesn't need auth, multi-tenancy, or enterprise features.
