// Tracking query params stripped before comparison.
const TRACKING_EXACT = new Set([
  'fbclid',
  'gclid',
  'igshid',
  'igsh',
  'mc_cid',
  'mc_eid',
  'yclid',
  'msclkid',
  'ref',
  'ref_src',
  'ref_url',
  '_ga',
  '_hsenc',
  '_hsmi',
])

const TRACKING_PREFIXES = ['utm_']

function isTrackingParam(key: string): boolean {
  const k = key.toLowerCase()
  if (TRACKING_EXACT.has(k)) return true
  return TRACKING_PREFIXES.some(p => k.startsWith(p))
}

/**
 * Produce a canonical form of a URL for fuzzy duplicate detection. Drops
 * tracking params, www prefix, fragments, and trailing slashes; sorts the
 * remaining query params for stable equality.
 *
 * Falls back to a lowercased, trailing-slash-trimmed string when URL parsing
 * fails so callers can still compare malformed inputs deterministically.
 */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim()
  try {
    const u = new URL(trimmed)
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '')
    u.hash = ''

    for (const key of Array.from(u.searchParams.keys())) {
      if (isTrackingParam(key)) u.searchParams.delete(key)
    }

    const sorted = Array.from(u.searchParams.entries()).sort(([a], [b]) => a.localeCompare(b))
    u.search = ''
    for (const [k, v] of sorted) u.searchParams.append(k, v)

    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1)
    }

    return u.toString()
  } catch {
    return trimmed.replace(/\/+$/, '').toLowerCase()
  }
}
