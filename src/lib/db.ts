import { supabase } from './supabase';
import type { Link, LinkInsert, Category } from './types';

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

    if (error || !data) break;
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

export async function getLinkById(id: string) {
  const { data, error } = await supabase
    .from('links')
    .select('*')
    .eq('id', id)
    .single();

  return { data: data as Link | null, error };
}

export async function createLink(link: LinkInsert) {
  const { data, error } = await supabase
    .from('links')
    .insert(link)
    .select()
    .single();

  return { data: data as Link | null, error };
}

export async function updateLink(id: string, updates: Partial<LinkInsert>) {
  const { data, error } = await supabase
    .from('links')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

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

// ── Categories ─────────────────────────────────────────

export async function getCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name', { ascending: true });

  return { data: data as Category[] | null, error };
}

export async function createCategory(name: string, color: string) {
  const { data, error } = await supabase
    .from('categories')
    .insert({ name, color })
    .select()
    .single();

  return { data: data as Category | null, error };
}

// ── Stats ──────────────────────────────────────────────

export async function getLinkStats() {
  const [totalRes, catRes, recentRes] = await Promise.all([
    supabase.from('links').select('*', { count: 'exact', head: true }),
    supabase.from('categories').select('*', { count: 'exact', head: true }),
    supabase
      .from('links')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
  ]);

  return {
    data: {
      totalLinks: totalRes.count ?? 0,
      totalCategories: catRes.count ?? 0,
      recentCount: recentRes.count ?? 0,
    },
    error: totalRes.error || catRes.error || recentRes.error,
  };
}
