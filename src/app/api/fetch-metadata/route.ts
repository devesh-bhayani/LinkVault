import { NextRequest, NextResponse } from 'next/server'
import { fetchMetadataServer } from '@/lib/fetch-metadata-server'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const url: unknown = body?.url

  if (typeof url !== 'string' || !url.startsWith('http')) {
    return NextResponse.json({ title: null, description: null, favicon: null }, { status: 400 })
  }

  const result = await fetchMetadataServer(url)
  return NextResponse.json(result)
}
