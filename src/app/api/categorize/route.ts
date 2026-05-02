import { NextRequest, NextResponse } from 'next/server'
import { categorizeServer } from '@/lib/categorize-server'

export async function POST(request: NextRequest) {
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
