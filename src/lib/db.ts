import { supabase } from './supabase';
import { normalizeUrl } from './url-normalize';
import type { Link, LinkInsert, Category } from './types';

// ── Auth (single user; see AuthGate + migration 003) ───

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error };
}

export async function signOut() {
  await supabase.auth.signOut();
}

export function getSession() {
  return supabase.auth.getSession();
}

/** Subscribe to sign-in/out changes. Returns an unsubscribe function. */
export function onAuthChange(callback: (signedIn: boolean) => void) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(!!session);
  });
  return () => data.subscription.unsubscribe();
}

/** Server-side: true if `token` is a valid Supabase access token for a user.
 *  Used to gate API routes that the signed-in browser calls (GAPS #4). */
export async function isValidAccessToken(token: string): Promise<boolean> {
  if (!token) return false;
  const { data, error } = await supabase.auth.getUser(token);
  return !error && !!data.user;
}

// ── Links ──────────────────────────────────────────────

export async function getLinks(options?: {
  search?: string;
  category?: string;
  unreadOnly?: boolean;
  ascending?: boolean;
  limit?: number;
  offset?: number;
}) {
  const {
    search,
    category,
    unreadOnly,
    ascending = false,
    limit = 50,
    offset = 0,
  } = options ?? {};

  let query = supabase
    .from('links')
    .select('*', { count: 'exact' });

  if (search) {
    query = query.textSearch('fts', search, { type: 'websearch' });
  }

  if (category) {
    query = query.eq('category', category);
  }

  if (unreadOnly) {
    query = query.eq('is_read', false);
  }

  query = query
    .order('created_at', { ascending })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  return { data: data as Link[] | null, error, count };
}

/** Fetch every link in the library — used by export. Pages internally to
 * stay under Supabase's per-request row cap. */
export async function getAllLinks(): Promise<Link[]> {
  const PAGE = 1000;
  const all: Link[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('links')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) throw error; // don't silently return a partial export
    if (!data) break;
    all.push(...(data as Link[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return all;
}

export async function getUnreadCount(): Promise<number> {
  const { count } = await supabase
    .from('links')
    .select('*', { count: 'exact', head: true })
    .eq('is_read', false);

  return count ?? 0;
}

export async function createLink(link: LinkInsert) {
  const { data, error } = await supabase
    .from('links')
    .insert(link)
    .select()
    .single();

  // Unique-URL violation (migration 002) — a soft "already saved", not a hard
  // error, so save flows can report it kindly instead of "failed".
  if (error?.code === '23505') {
    return { data: null as Link | null, error: null, duplicate: true };
  }

  if (!error && link.category) await ensureCategory(link.category);

  return { data: data as Link | null, error, duplicate: false };
}

export async function updateLink(id: string, updates: Partial<LinkInsert>) {
  const { data, error } = await supabase
    .from('links')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (!error && updates.category) await ensureCategory(updates.category);

  return { data: data as Link | null, error };
}

export async function deleteLink(id: string) {
  const { error } = await supabase
    .from('links')
    .delete()
    .eq('id', id);

  return { error };
}

export async function bulkUpdateLinks(ids: string[], updates: Partial<LinkInsert>) {
  if (ids.length === 0) return { data: [] as Link[], error: null };

  const { data, error } = await supabase
    .from('links')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .in('id', ids)
    .select();

  if (!error && updates.category) await ensureCategory(updates.category);

  return { data: data as Link[] | null, error };
}

export async function bulkDeleteLinks(ids: string[]) {
  if (ids.length === 0) return { error: null };

  const { error } = await supabase
    .from('links')
    .delete()
    .in('id', ids);

  return { error };
}

export async function bulkCreateLinks(links: LinkInsert[]) {
  const { data, error } = await supabase
    .from('links')
    .upsert(links, { onConflict: 'url' })
    .select();

  return { data: data as Link[] | null, error };
}

/** Returns the subset of the given URLs that already exist in the database. */
export async function getExistingUrls(urls: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set();

  const { data } = await supabase
    .from('links')
    .select('url')
    .in('url', urls);

  return new Set((data ?? []).map((r: { url: string }) => r.url));
}

/** Returns every stored URL in normalized form — used for fuzzy dedup. */
export async function getAllNormalizedUrls(): Promise<Set<string>> {
  const PAGE = 1000;
  const norm = new Set<string>();
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('links')
      .select('url')
      .range(from, from + PAGE - 1);

    if (error) throw error; // a partial set would let real dupes slip through
    if (!data) break;
    for (const row of data as { url: string }[]) {
      norm.add(normalizeUrl(row.url));
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return norm;
}

// ── Categories ─────────────────────────────────────────

export async function getCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name', { ascending: true });

  return { data: data as Category[] | null, error };
}

// links.category is free text; the categories table drives the filter pills
// and tag colors. Without this, custom tags saved on links never appear as
// pills (GAPS #9). Register any category we write so it becomes filterable.
const CATEGORY_PALETTE = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B',
  '#EF4444', '#EC4899', '#6366F1', '#6B7280',
];

/** Stable palette color for a name (seeded categories keep their own via the
 *  ignoreDuplicates upsert below). */
function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CATEGORY_PALETTE[h % CATEGORY_PALETTE.length];
}

/** Best-effort: ensure `name` exists in the categories table so it shows as a
 *  filter pill. Never throws — a save must not fail because tagging did. */
export async function ensureCategory(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  try {
    await supabase
      .from('categories')
      .upsert({ name: trimmed, color: colorFor(trimmed) }, {
        onConflict: 'name',
        ignoreDuplicates: true,
      });
  } catch {
    // tagging is a nice-to-have; ignore failures
  }
}

