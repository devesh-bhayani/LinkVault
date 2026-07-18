import { NextRequest, NextResponse } from 'next/server'
import { categorizeServer } from '@/lib/categorize-server'
import { isValidAccessToken } from '@/lib/db'

const IS_PROD = process.env.NODE_ENV === 'production'

export async function POST(request: NextRequest) {
  // The in-app form is the only legit caller; it now runs behind auth, so in
  // production require the signed-in user's session token (GAPS #4) to stop
  // anonymous callers relaying to a tunneled Ollama. Dev stays open.
  if (IS_PROD) {
    const auth = request.headers.get('authorization')
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : ''
    if (!(await isValidAccessToken(token))) {
      return NextResponse.json({ category: null }, { status: 401 })
    }
  }

  const body = await request.json()
  const title: unknown = body?.title
  const description: unknown = body?.description
  const url: unknown = body?.url

  if (!title && !description && !url) {
    return NextResponse.json({ category: null }, { status: 400 })
  }

  const category = await categorizeServer(
    (url as string) ?? '',
    (title as string) ?? null,
    (description as string) ?? null,
  )

  return NextResponse.json({ category })
}
