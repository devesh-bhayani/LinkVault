'use client'

import type { Link, Category } from '@/lib/types'
import LinkCard from './LinkCard'

interface LinkListProps {
  links: Link[]
  categories: Category[]
  loading?: boolean
  onDeleted: (id: string) => void
  onUpdated: (link: Link) => void
  onEdit: (link: Link) => void
}

const SKELETON_COUNT = 6

export default function LinkList({ links, categories, loading, onDeleted, onUpdated, onEdit }: LinkListProps) {
  const colorMap = new Map(categories.map(c => [c.name, c.color]))

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
          <div key={i} className="bg-white rounded-card shadow-card p-4 animate-pulse">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-4 h-4 rounded bg-foreground/10" />
              <div className="h-4 bg-foreground/10 rounded w-3/4" />
            </div>
            <div className="h-3 bg-foreground/5 rounded w-full mt-2" />
            <div className="h-3 bg-foreground/5 rounded w-2/3 mt-1.5" />
            <div className="flex gap-2 mt-3">
              <div className="h-5 bg-foreground/5 rounded-pill w-16" />
              <div className="h-5 bg-foreground/5 rounded w-20 ml-auto" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (links.length === 0) return null

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {links.map(link => (
        <LinkCard
          key={link.id}
          link={link}
          categoryColor={link.category ? colorMap.get(link.category) ?? null : null}
          onDeleted={onDeleted}
          onUpdated={onUpdated}
          onEdit={onEdit}
        />
      ))}
    </div>
  )
}
