import { NextRequest, NextResponse } from 'next/server'
import { fetchMetadataServer } from '@/lib/fetch-metadata-server'
import { categorizeServer } from '@/lib/categorize-server'
import { createLink } from '@/lib/db'

const API_KEY = process.env.QUICK_SAVE_API_KEY

export async function POST(request: NextRequest) {
  // Auth: require API key if one is configured
  if (API_KEY) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${API_KEY}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const body = await request.json()
    const url: unknown = body?.url

    if (typeof url !== 'string' || !url.startsWith('http')) {
      return NextResponse.json({ error: 'A valid URL is required' }, { status: 400 })
    }

    // Fetch metadata and categorize in parallel
    const [meta, aiCategory] = await Promise.all([
      fetchMetadataServer(url),
      categorizeServer(url, body?.title ?? null, body?.description ?? null),
    ])

    const { data, error } = await createLink({
      url,
      title: body?.title ?? meta.title,
      description: body?.description ?? meta.description,
      category: body?.category ?? aiCategory,
      source: 'manual',
      sender_username: null,
      sender_message_context: null,
      original_timestamp: null,
      is_read: false,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
