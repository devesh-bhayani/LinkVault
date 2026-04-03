'use client'

import { useState, useMemo } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ExternalLink, CheckSquare, Square, Loader2, Instagram } from 'lucide-react'
import type { ExtractedLink } from '@/lib/types'

interface PreviewItem extends ExtractedLink {
  alreadySaved: boolean
}

interface ImportPreviewProps {
  items: PreviewItem[]
  onConfirm: (selected: ExtractedLink[]) => Promise<void>
  onBack: () => void
}

export default function ImportPreview({ items, onConfirm, onBack }: ImportPreviewProps) {
  const newItems = useMemo(() => items.filter(i => !i.alreadySaved), [items])
  const [selected, setSelected] = useState<Set<string>>(() => new Set(newItems.map(i => i.url)))
  const [showDupes, setShowDupes] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [filter, setFilter] = useState<'new' | 'all'>('new')

  const dupeCount = items.length - newItems.length
  const displayed = filter === 'new' ? newItems : items
  const selectedCount = Array.from(selected).filter(url => displayed.some(i => i.url === url)).length

  function toggleItem(url: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })
  }

  function toggleAll() {
    const displayedNew = displayed.filter(i => !i.alreadySaved)
    const allSelected = displayedNew.every(i => selected.has(i.url))
    setSelected(prev => {
      const next = new Set(prev)
      displayedNew.forEach(i => allSelected ? next.delete(i.url) : next.add(i.url))
      return next
    })
  }

  async function handleConfirm() {
    const toImport = newItems.filter(i => selected.has(i.url))
    if (toImport.length === 0) return
    setIsImporting(true)
    await onConfirm(toImport)
    setIsImporting(false)
  }

  function truncateUrl(url: string, max = 52) {
    try {
      const { hostname, pathname } = new URL(url)
      const s = hostname + pathname
      return s.length > max ? s.slice(0, max) + '…' : s
    } catch {
      return url.length > max ? url.slice(0, max) + '…' : url
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-3 p-4 bg-white border border-foreground/10 rounded-card">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            {items.length} link{items.length !== 1 ? 's' : ''} found
          </p>
          <p className="text-xs text-foreground/50 mt-0.5">
            {newItems.length} new
            {dupeCount > 0 && ` · ${dupeCount} already saved`}
          </p>
        </div>

        {/* Filter toggle */}
        <div className="flex rounded-input border border-foreground/10 overflow-hidden text-xs font-medium">
          {(['new', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 transition-colors ${
                filter === f ? 'bg-accent text-white' : 'hover:bg-foreground/5 text-foreground/60'
              }`}
            >
              {f === 'new' ? `New (${newItems.length})` : `All (${items.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Select all row */}
      {displayed.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <button
            onClick={toggleAll}
            className="flex items-center gap-1.5 text-xs text-foreground/60 hover:text-foreground"
          >
            {displayed.filter(i => !i.alreadySaved).every(i => selected.has(i.url))
              ? <CheckSquare size={14} className="text-accent" />
              : <Square size={14} />
            }
            Select all
          </button>
          <span className="text-xs text-foreground/40">{selected.size} selected</span>
        </div>
      )}

      {/* Link list */}
      <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
        {displayed.length === 0 && (
          <p className="text-sm text-center text-foreground/40 py-8">No new links to import.</p>
        )}

        {displayed.map(item => {
          const isNew = !item.alreadySaved
          const isChecked = selected.has(item.url)

          return (
            <div
              key={item.url}
              onClick={() => isNew && toggleItem(item.url)}
              className={`flex items-start gap-3 p-3 rounded-input border transition-colors ${
                item.alreadySaved
                  ? 'border-foreground/5 bg-foreground/2 opacity-50 cursor-default'
                  : isChecked
                    ? 'border-accent/30 bg-accent/5 cursor-pointer'
                    : 'border-foreground/10 bg-white hover:border-foreground/20 cursor-pointer'
              }`}
            >
              {/* Checkbox */}
              <div className="mt-0.5 shrink-0">
                {item.alreadySaved ? (
                  <span className="text-xs text-foreground/40 whitespace-nowrap">saved</span>
                ) : isChecked ? (
                  <CheckSquare size={16} className="text-accent" />
                ) : (
                  <Square size={16} className="text-foreground/30" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{truncateUrl(item.url)}</p>
                {item.messageContext && (
                  <p className="text-xs text-foreground/50 mt-0.5 line-clamp-1">
                    {item.messageContext}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  {item.senderUsername && (
                    <span className="flex items-center gap-1 text-xs text-foreground/40">
                      <Instagram size={10} />
                      {item.senderUsername}
                    </span>
                  )}
                  <span className="text-xs text-foreground/30">
                    {formatDistanceToNow(item.originalTimestamp, { addSuffix: true })}
                  </span>
                </div>
              </div>

              {/* Open link */}
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="shrink-0 p-1 text-foreground/30 hover:text-accent transition-colors"
              >
                <ExternalLink size={13} />
              </a>
            </div>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onBack}
          disabled={isImporting}
          className="px-4 py-2.5 rounded-input border border-foreground/15 text-sm font-medium hover:bg-foreground/5 disabled:opacity-50 transition-colors"
        >
          Back
        </button>
        <button
          onClick={handleConfirm}
          disabled={isImporting || selected.size === 0}
          className="flex-1 btn-primary flex items-center justify-center gap-2 py-2.5 text-sm"
        >
          {isImporting ? (
            <><Loader2 size={15} className="animate-spin" /> Importing…</>
          ) : (
            `Import ${selected.size} link${selected.size !== 1 ? 's' : ''}`
          )}
        </button>
      </div>
    </div>
  )
}
