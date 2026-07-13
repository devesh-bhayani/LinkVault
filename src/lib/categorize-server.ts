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

/** Categorize a link using Ollama. Returns null if Ollama is unavailable. */
export async function categorizeServer(
  url: string,
  title: string | null,
  description: string | null,
): Promise<string | null> {
  try {
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
      const raw: string = data?.message?.content?.trim() ?? ''

      return CATEGORIES.find(c => c.toLowerCase() === raw.toLowerCase()) ?? null
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return null
  }
}
