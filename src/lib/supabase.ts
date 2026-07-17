import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Server-side only (API routes; never inlined into the browser bundle):
// prefer the service role key so /api/quick-save can write with RLS enabled
// (migration 003). Browser code always gets the anon key — there, RLS plus
// the signed-in session (AuthGate) protect the data.
const supabaseKey =
  typeof window === 'undefined'
    ? process.env.SUPABASE_SERVICE_ROLE_KEY ?? supabaseAnonKey
    : supabaseAnonKey

export const supabase = createClient(supabaseUrl, supabaseKey)
