'use client'

import { useState, useRef, useEffect } from 'react'
import { Tag, Eye, EyeOff, Trash2, X, Loader2, ChevronUp, CheckCheck } from 'lucide-react'
import type { Category } from '@/lib/types'

interface BulkActionBarProps {
  count: number
  totalVisible: number
  categories: Category[]
  onSetCategory: (category: string | null) => Promise<void>
  onSetRead: (isRead: boolean) => Promise<void>
  onDelete: () => Promise<void>
  onSelectAll: () => void
  onCancel: () => void
}

export default function BulkActionBar({
  count,
  totalVisible,
  categories,
  onSetCategory,
  onSetRead,
  onDelete,
  onSelectAll,
  onCancel,
}: BulkActionBarProps) {
  const [working, setWorking] = useState<string | null>(null)
  const [catOpen, setCatOpen] = useState(false)
  const [customCat, setCustomCat] = useState('')
  const popoverRef = useRef<HTMLDivElement>(null)

  const allSelected = count > 0 && count === totalVisible

  // Close category popover when clicking outside
  useEffect(() => {
    if (!catOpen) return
    function onDoc(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setCatOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [catOpen])

  async function run(label: string, fn: () => Promise<void>) {
    setWorking(label)
    try { await fn() } finally { setWorking(null) }
  }

  async function pickCategory(name: string | null) {
    setCatOpen(false)
    setCustomCat('')
    await run('cat', () => onSetCategory(name))
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-2rem)]">
      <div className="bg-foreground text-background rounded-card shadow-card-hover px-3 py-2 flex items-center gap-1 text-sm">
        <span className="px-2 font-medium tabular-nums">
          {count} selected
        </span>

        <button
          onClick={onSelectAll}
          disabled={!!working}
          className="px-2 py-1.5 rounded-input hover:bg-background/10 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          title={allSelected ? 'Deselect all' : 'Select all visible'}
        >
          <CheckCheck size={14} />
          <span className="hidden sm:inline text-xs">{allSelected ? 'None' : 'All'}</span>
        </button>

        <div className="w-px h-5 bg-background/20 mx-1" />

        {/* Set category */}
        <div className="relative" ref={popoverRef}>
          <button
            onClick={() => setCatOpen(v => !v)}
            disabled={!!working || count === 0}
            className="px-2 py-1.5 rounded-input hover:bg-background/10 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {working === 'cat' ? <Loader2 size={14} className="animate-spin" /> : <Tag size={14} />}
            <span className="hidden sm:inline text-xs">Tag</span>
            <ChevronUp size={12} className={`transition-transform ${catOpen ? '' : 'rotate-180'}`} />
          </button>
          {catOpen && (
            <div className="absolute bottom-full mb-2 right-0 bg-white text-foreground rounded-card shadow-card-hover border border-foreground/10 min-w-[200px] py-1 max-h-[60vh] overflow-y-auto">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => pickCategory(cat.name)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-foreground/5 flex items-center gap-2"
                >
                  {cat.color && (
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: cat.color }}
                    />
                  )}
                  {cat.name}
                </button>
              ))}
              <div className="border-t border-foreground/5 mt-1 pt-1 px-2">
                <input
                  type="text"
                  placeholder="Custom tag…"
                  value={customCat}
                  onChange={e => setCustomCat(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && customCat.trim()) {
                      pickCategory(customCat.trim())
                    }
                  }}
                  className="w-full px-2 py-1.5 text-xs border border-foreground/10 rounded-input outline-none focus:border-accent"
                />
              </div>
              <button
                onClick={() => pickCategory(null)}
                className="w-full text-left px-3 py-2 text-xs text-foreground/50 hover:bg-foreground/5 border-t border-foreground/5 mt-1"
              >
                Clear category
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => run('read', () => onSetRead(true))}
          disabled={!!working || count === 0}
          className="px-2 py-1.5 rounded-input hover:bg-background/10 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          title="Mark as read"
        >
          {working === 'read' ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
          <span className="hidden sm:inline text-xs">Read</span>
        </button>

        <button
          onClick={() => run('unread', () => onSetRead(false))}
          disabled={!!working || count === 0}
          className="px-2 py-1.5 rounded-input hover:bg-background/10 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          title="Mark as unread"
        >
          {working === 'unread' ? <Loader2 size={14} className="animate-spin" /> : <EyeOff size={14} />}
          <span className="hidden sm:inline text-xs">Unread</span>
        </button>

        <button
          onClick={() => {
            if (confirm(`Delete ${count} link${count !== 1 ? 's' : ''}? This can't be undone.`)) {
              run('del', onDelete)
            }
          }}
          disabled={!!working || count === 0}
          className="px-2 py-1.5 rounded-input hover:bg-red-500/30 text-red-300 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          title="Delete"
        >
          {working === 'del' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          <span className="hidden sm:inline text-xs">Delete</span>
        </button>

        <div className="w-px h-5 bg-background/20 mx-1" />

        <button
          onClick={onCancel}
          disabled={!!working}
          className="p-1.5 rounded-input hover:bg-background/10 transition-colors disabled:opacity-50"
          title="Cancel"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
