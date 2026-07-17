import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'
import type { MetadataResult } from './types'

const TIMEOUT_MS = 5_000
const MAX_REDIRECTS = 3
const MAX_BYTES = 512 * 1024 // metadata lives in <head>; no need to read more
const NULL_RESULT: MetadataResult = { title: null, description: null, favicon: null }

// ── SSRF guard (GAPS.md #3) ────────────────────────────────────────────────
// Callers hand us arbitrary URLs and we fetch them server-side, so block
// anything that could reach loopback/private/link-local/reserved space.
// Checking the RESOLVED addresses (not the hostname string) also catches
// obfuscated IP forms ("2130706433", "0x7f.1") and internal DNS names.
// Residual risk: DNS rebinding between our lookup and fetch's own — accepted
// for a personal tool; a pinned-IP dispatcher would be the next step up.

/** True for loopback/private/link-local/CGNAT/reserved addresses (v4 + v6). */
export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) return isPrivateV4(ip)
  const v6 = ip.toLowerCase()
  if (v6 === '::' || v6 === '::1') return true
  if (v6.startsWith('fc') || v6.startsWith('fd')) return true // fc00::/7 unique-local
  if (/^fe[89ab]/.test(v6)) return true // fe80::/10 link-local
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateV4(mapped[1])
  return false
}

function isPrivateV4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number)
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // multicast + reserved
  )
}

/** Only http(s), no localhost, and every resolved address must be public. */
async function isSafeUrl(url: URL): Promise<boolean> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  const host = url.hostname.replace(/^\[|\]$/g, '') // URL brackets IPv6 hosts
  if (host === 'localhost' || host.endsWith('.localhost')) return false
  if (isIP(host)) return !isPrivateIp(host)
  try {
    const addrs = await lookup(host, { all: true })
    return addrs.length > 0 && addrs.every(a => !isPrivateIp(a.address))
  } catch {
    return false // unresolvable — nothing to fetch anyway
  }
}

/** Fetch HTML with per-hop SSRF validation, content-type check, capped read. */
async function fetchHtmlSafely(rawUrl: string, signal: AbortSignal): Promise<string | null> {
  let current = new URL(rawUrl)

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await isSafeUrl(current))) return null

    const res = await fetch(current.href, {
      signal,
      redirect: 'manual', // follow by hand so every hop gets re-validated
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LinkVault/1.0; +https://github.com/linkvault)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location) return null
      current = new URL(location, current)
      continue
    }

    if (!res.ok) return null

    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return null
    }

    const reader = res.body?.getReader()
    if (!reader) return null
    const chunks: Uint8Array[] = []
    let total = 0
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      total += value.length
    }
    reader.cancel().catch(() => {})

    return Buffer.concat(chunks).subarray(0, MAX_BYTES).toString('utf8')
  }

  return null // redirect chain too long
}

/** Decode common HTML entities in extracted text */
function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .trim()
}

/** Extract a meta tag content — handles both attribute orders */
function getMeta(html: string, name: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`, 'i'),
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m?.[1]) return decodeEntities(m[1])
  }
  return null
}

/** Resolve a potentially relative URL against the page origin */
function resolveUrl(href: string, pageUrl: string): string {
  try {
    return new URL(href, pageUrl).href
  } catch {
    return href
  }
}

/** Fetch title, description, and favicon from a URL (server-side). */
export async function fetchMetadataServer(url: string): Promise<MetadataResult> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    let html: string | null
    try {
      html = await fetchHtmlSafely(url, controller.signal)
    } finally {
      clearTimeout(timer)
    }
    if (html === null) return NULL_RESULT

    const title =
      getMeta(html, 'og:title') ??
      getMeta(html, 'twitter:title') ??
      (() => {
        const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
        return m ? decodeEntities(m[1].replace(/\s+/g, ' ')) : null
      })()

    const description =
      getMeta(html, 'og:description') ??
      getMeta(html, 'twitter:description') ??
      getMeta(html, 'description')

    const faviconMatch =
      html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["'][^>]*>/i) ??
      html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["'][^>]*>/i) ??
      html.match(/<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["'][^>]*>/i)

    const favicon = faviconMatch ? resolveUrl(faviconMatch[1], url) : null

    return { title, description, favicon }
  } catch {
    return NULL_RESULT
  }
}
