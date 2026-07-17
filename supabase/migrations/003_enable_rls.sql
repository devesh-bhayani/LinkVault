-- Lock down the data plane (GAPS.md #2).
--
-- The anon key ships in the browser bundle, so with RLS off anyone who loads
-- the deployed site can read/write/delete everything via Supabase's REST API.
-- This enables RLS with "any signed-in user" policies — the app is single-user,
-- so the one account created in the dashboard IS the authorization model.
-- The server (quick-save route, backfill script) uses the service role key,
-- which bypasses RLS.
--
-- Apply BY HAND against Supabase (SQL editor or `supabase db push`).
--
-- ORDER MATTERS — before applying this:
--   1. Supabase dashboard → Authentication → Add user (check "Auto Confirm").
--   2. Add SUPABASE_SERVICE_ROLE_KEY to .env.local and the Vercel env.
--   3. Then apply. From this point every browser session must sign in;
--      anonymous queries silently return zero rows (not an error).

ALTER TABLE links ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated full access" ON links
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated full access" ON categories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
