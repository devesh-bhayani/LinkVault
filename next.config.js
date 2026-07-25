/** @type {import('next').NextConfig} */

// The browser talks to Supabase directly, so its origin has to be allowed in
// connect-src. Derive it from env rather than hardcoding *.supabase.co, which
// would break a self-hosted instance.
function supabaseOrigins() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!raw) return ''
  try {
    const { origin, host } = new URL(raw)
    return ` ${origin} wss://${host}` // wss for Supabase realtime/auth sockets
  } catch {
    return ''
  }
}

// 'unsafe-inline' is required by Next's inline bootstrap/style injection;
// 'unsafe-eval' only by React Refresh in dev.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:", // favicons are fetched from third-party hosts
  "font-src 'self' data:",
  `connect-src 'self'${supabaseOrigins()}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ]
  },
}

module.exports = nextConfig
