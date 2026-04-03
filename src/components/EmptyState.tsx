'use client'

import Link from 'next/link'
import { BookmarkPlus } from 'lucide-react'

export default function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mb-4">
        <BookmarkPlus size={28} className="text-accent" />
      </div>
      <h2 className="text-lg font-semibold">No links saved yet</h2>
      <p className="text-sm text-foreground/60 mt-1 max-w-xs">
        Start by saving your first link — paste a URL and you&apos;re done.
      </p>
      <Link
        href="/add"
        className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-input text-sm font-medium hover:bg-accent-hover transition-colors"
      >
        <BookmarkPlus size={16} />
        Save your first link
      </Link>
    </div>
  )
}
