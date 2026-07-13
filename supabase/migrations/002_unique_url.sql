-- Enforce URL uniqueness so imports can upsert ON CONFLICT (url).
-- The original migration only made a NON-unique index on links.url, so
-- `bulkCreateLinks`' `upsert(..., { onConflict: 'url' })` was rejected by
-- Postgres (error 42P10) and every import inserted zero rows. (GAPS.md #1)
--
-- Apply BY HAND against Supabase (SQL editor or `supabase db push`).
-- WARNING: the two DELETEs below remove existing duplicate-URL rows, keeping
-- the earliest-created one of each. Review your data before running if that
-- matters.

-- Drop duplicates, keeping the earliest created_at per url.
DELETE FROM links a
USING links b
WHERE a.url = b.url
  AND a.created_at > b.created_at;

-- Break exact-timestamp ties deterministically by id.
DELETE FROM links a
USING links b
WHERE a.url = b.url
  AND a.created_at = b.created_at
  AND a.id > b.id;

-- Replace the non-unique index with a unique one (also serves URL lookups).
DROP INDEX IF EXISTS idx_links_url;
CREATE UNIQUE INDEX idx_links_url ON links(url);
