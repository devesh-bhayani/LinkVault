-- Links table
CREATE TABLE links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT,
  description TEXT,
  category TEXT,
  source TEXT DEFAULT 'manual',
  sender_username TEXT,
  sender_message_context TEXT,
  original_timestamp TIMESTAMPTZ,
  is_read BOOLEAN DEFAULT FALSE,
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

-- Categories table
CREATE TABLE categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default categories
INSERT INTO categories (name, color) VALUES
  ('Coding', '#3B82F6'),
  ('Design', '#8B5CF6'),
  ('Finance', '#10B981'),
  ('Career', '#F59E0B'),
  ('Free PDF', '#EF4444'),
  ('Course', '#EC4899'),
  ('Tool', '#6366F1'),
  ('Other', '#6B7280');
