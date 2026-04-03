import { NextRequest, NextResponse } from 'next/server'

const NULL_RESULT = { title: null, description: null, favicon: null }
const TIMEOUT_MS = 5_000

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
  // <meta name="..." content="...">  OR  <meta content="..." name="...">
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const url: unknown = body?.url

    if (typeof url !== 'string' || !url.startsWith('http')) {
      return NextResponse.json(NULL_RESULT, { status: 400 })
    }

    // Abort after TIMEOUT_MS
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    let html: string
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; LinkVault/1.0; +https://github.com/linkvault)',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      })
      html = await res.text()
    } finally {
      clearTimeout(timer)
    }

    // ── Title: prefer og:title → twitter:title → <title> ──────────────
    const title =
      getMeta(html, 'og:title') ??
      getMeta(html, 'twitter:title') ??
      (() => {
        const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
        return m ? decodeEntities(m[1].replace(/\s+/g, ' ')) : null
      })()

    // ── Description: prefer og:description → twitter:description → description ──
    const description =
      getMeta(html, 'og:description') ??
      getMeta(html, 'twitter:description') ??
      getMeta(html, 'description')

    // ── Favicon: icon → shortcut icon → apple-touch-icon ──────────────
    const faviconMatch =
      html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["'][^>]*>/i) ??
      html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["'][^>]*>/i) ??
      html.match(/<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["'][^>]*>/i)

    const favicon = faviconMatch ? resolveUrl(faviconMatch[1], url) : null

    return NextResponse.json({ title, description, favicon })
  } catch {
    // Network error, timeout, parse failure — return nulls gracefully
    return NextResponse.json(NULL_RESULT)
  }
}
