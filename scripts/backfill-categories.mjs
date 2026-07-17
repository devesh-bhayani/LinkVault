#!/usr/bin/env node
/**
 * Backfill AI categories for untagged links — run LOCALLY where Ollama lives.
 *
 * This is the batch half of LinkVault's tagging strategy. The deployed app
 * (e.g. on Vercel) can't reach your local Ollama, so links saved there land
 * with category = null. Run this on your machine to tag everything in one pass:
 *
 *   pnpm categorize            # tag all untagged links
 *   pnpm categorize --dry-run  # show what would be tagged, change nothing
 *   pnpm categorize --limit 50 # only process the first 50
 *
 * Reads Supabase + Ollama config from .env.local (same vars the app uses).
 * Self-contained: only depends on @supabase/supabase-js (already installed).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ── Minimal .env.local loader (no extra deps) ──────────────────────────────
function loadEnv(path) {
  try {
    const text = readFileSync(path, 'utf8')
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const key = m[1]
      let val = m[2].trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      if (!(key in process.env)) process.env[key] = val
    }
  } catch {
    // no .env.local — rely on the ambient environment
  }
}

loadEnv(resolve(ROOT, '.env.local'))

// ── Config (kept in sync with src/lib/categorize-server.ts) ────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
// Prefer the service role key — with RLS enabled (migration 003) the anon
// key can't read or write links. Falls back to anon for pre-RLS setups.
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434'
const MODEL = process.env.OLLAMA_MODEL ?? 'qwen3:8b'
const TIMEOUT_MS = 15_000

const CATEGORIES = [
  'Coding',
  'Design',
  'Finance',
  'Career',
  'Free PDF',
  'Course',
  'Tool',
  'Other',
]

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const limitArg = args.indexOf('--limit')
const LIMIT = limitArg !== -1 ? Number(args[limitArg + 1]) : Infinity

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    '✗ Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.\n' +
      '  Add them to .env.local (the same file the app uses).',
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function categorize(url, title, description) {
  const prompt = `You are a link categorizer. Given a link's details, pick the single most fitting category from this list:
${CATEGORIES.join(', ')}

Link details:
- URL: ${url}
- Title: ${title ?? ''}
- Description: ${description ?? ''}

Reply with ONLY the category name, nothing else. No explanation, no punctuation. /no_think`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: { temperature: 0 },
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const raw = (data?.message?.content ?? '').trim()
    return CATEGORIES.find(c => c.toLowerCase() === raw.toLowerCase()) ?? null
  } finally {
    clearTimeout(timer)
  }
}

async function ollamaReachable() {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3_000)
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: controller.signal })
    clearTimeout(timer)
    return res.ok
  } catch {
    return false
  }
}

async function main() {
  console.log(`LinkVault categorize — model "${MODEL}" via ${OLLAMA_URL}`)
  if (DRY_RUN) console.log('(dry run — no changes will be written)\n')

  if (!(await ollamaReachable())) {
    console.error(
      `✗ Can't reach Ollama at ${OLLAMA_URL}.\n` +
        '  Start it with `ollama serve` and make sure the model is pulled:\n' +
        `    ollama pull ${MODEL}`,
    )
    process.exit(1)
  }

  // Pull every untagged link (paginate to clear Supabase's row cap)
  const PAGE = 1000
  const links = []
  let from = 0
  while (links.length < LIMIT) {
    const { data, error } = await supabase
      .from('links')
      .select('id, url, title, description')
      .is('category', null)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) {
      console.error('✗ Supabase query failed:', error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break
    links.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  const queue = links.slice(0, LIMIT === Infinity ? links.length : LIMIT)
  if (queue.length === 0) {
    console.log('✓ Nothing to do — every link already has a category.')
    return
  }

  console.log(`Found ${queue.length} untagged link${queue.length === 1 ? '' : 's'}.\n`)

  let tagged = 0
  let skipped = 0
  for (let i = 0; i < queue.length; i++) {
    const link = queue[i]
    const label = link.title || link.url
    process.stdout.write(`[${i + 1}/${queue.length}] ${label.slice(0, 60)} … `)

    const category = await categorize(link.url, link.title, link.description)
    if (!category) {
      console.log('no suggestion')
      skipped++
      continue
    }

    if (DRY_RUN) {
      console.log(`→ ${category} (dry run)`)
      tagged++
      continue
    }

    const { error } = await supabase
      .from('links')
      .update({ category, updated_at: new Date().toISOString() })
      .eq('id', link.id)
    if (error) {
      console.log(`✗ update failed: ${error.message}`)
      skipped++
    } else {
      console.log(`→ ${category}`)
      tagged++
    }
  }

  console.log(
    `\n✓ Done. ${tagged} tagged, ${skipped} skipped${DRY_RUN ? ' (dry run)' : ''}.`,
  )
}

main().catch(err => {
  console.error('✗ Unexpected error:', err)
  process.exit(1)
})
