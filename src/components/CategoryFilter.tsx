'use client'

import type { Category } from '@/lib/types'

interface CategoryFilterProps {
  categories: Category[]
  selected: string | null
  onSelect: (category: string | null) => void
}

export default function CategoryFilter({ categories, selected, onSelect }: CategoryFilterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onSelect(null)}
        className={`px-3 py-1 rounded-pill text-xs font-medium transition-colors ${
          selected === null
            ? 'bg-accent text-white'
            : 'bg-foreground/5 text-foreground/60 hover:bg-foreground/10'
        }`}
      >
        All
      </button>

      {categories.map(cat => (
        <button
          key={cat.id}
          onClick={() => onSelect(selected === cat.name ? null : cat.name)}
          className="px-3 py-1 rounded-pill text-xs font-medium transition-all"
          style={
            selected === cat.name
              ? { backgroundColor: cat.color ?? '#C45D3E', color: '#fff' }
              : { backgroundColor: (cat.color ?? '#C45D3E') + '18', color: cat.color ?? '#C45D3E' }
          }
        >
          {cat.name}
        </button>
      ))}
    </div>
  )
}
