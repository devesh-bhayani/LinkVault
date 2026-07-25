'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ExternalLink, MoreHorizontal, Trash2, Edit2, Eye, EyeOff, Instagram, Check, CheckSquare, Square } from 'lucide-react'
import { deleteLink, updateLink } from '@/lib/db'
import type { Link } from '@/lib/types'

interface LinkCardProps {
  link: Link
  categoryColor?: string | null
  reviewMode?: boolean
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
  onDeleted: (id: string) => void
  onUpdated: (link: Link) => void
  onEdit: (link: Link) => void
  onError?: (message: string) => void
}

function getFaviconUrl(url: string): string {
  try {
    const { hostname } = new URL(url)
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`
  } catch {
    return ''
  }
}

function truncateUrl(url: string, maxLen = 48): string {
  try {
    const { hostname, pathname } = new URL(url)
    const short = hostname + pathname
    return short.length > maxLen ? short.slice(0, maxLen) + '…' : short
  } catch {
    return url.length > maxLen ? url.slice(0, maxLen) + '…' : url
  }
}

export default function LinkCard({ link, categoryColor, reviewMode, selectable, selected, onToggleSelect, onDeleted, onUpdated, onEdit, onError }: LinkCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isTogglingRead, setIsTogglingRead] = useState(false)
  const [isMarkingDone, setIsMarkingDone] = useState(false)

  const faviconUrl = getFaviconUrl(link.url)
  const relativeDate = formatDistanceToNow(new Date(link.created_at), { addSuffix: true })

  async function handleDelete() {
    setMenuOpen(false)
    // Deletes are permanent and this is a one-tap action on a phone.
    if (!confirm('Delete this link? This can’t be undone.')) return
    setIsDeleting(true)
    const { error } = await deleteLink(link.id)
    if (error) {
      // Don't remove the card on a failed delete — it'd reappear on reload.
      setIsDeleting(false)
      onError?.('Failed to delete link. Try again.')
      return
    }
    onDeleted(link.id)
  }

  async function handleToggleRead() {
    setMenuOpen(false)
    setIsTogglingRead(true)
    const { data, error } = await updateLink(link.id, { is_read: !link.is_read })
    if (data) onUpdated(data)
    else if (error) onError?.('Failed to update link.')
    setIsTogglingRead(false)
  }

  async function handleOpenAndDone() {
    window.open(link.url, '_blank', 'noopener,noreferrer')
    setIsMarkingDone(true)
    const { data } = await updateLink(link.id, { is_read: true })
    if (data) onUpdated(data)
    setIsMarkingDone(false)
  }

  return (
    <div
      onClick={selectable ? () => onToggleSelect?.(link.id) : undefined}
      className={`relative bg-white rounded-card shadow-card hover:shadow-card-hover transition-all group ${
        isDeleting ? 'opacity-40 pointer-events-none scale-95' : ''
      } ${link.is_read ? 'opacity-70' : ''} ${
        selectable ? 'cursor-pointer' : ''
      } ${selected ? 'ring-2 ring-accent' : ''}`}
    >
      {/* Category color bar */}
      {categoryColor && (
        <div
          className="absolute top-0 left-0 right-0 h-0.5 rounded-t-card"
          style={{ backgroundColor: categoryColor }}
        />
      )}

      <div className="p-4">
        {/* Header row: favicon + title + menu */}
        <div className="flex items-start gap-2.5">
          {selectable && (
            <span className="shrink-0 mt-0.5 text-accent">
              {selected ? <CheckSquare size={16} /> : <Square size={16} className="text-foreground/30" />}
            </span>
          )}
          {faviconUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={faviconUrl}
              alt=""
              width={16}
              height={16}
              className="w-4 h-4 rounded-sm shrink-0 mt-0.5"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          )}

          <div className="flex-1 min-w-0">
            <h3
              className={`font-medium text-sm leading-snug line-clamp-2 ${
                link.is_read ? 'text-foreground/50' : 'text-foreground'
              }`}
            >
              {link.title || truncateUrl(link.url)}
            </h3>
          </div>

          {/* Kebab menu */}
          {!selectable && (
          <div className="relative shrink-0">
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="p-1 -mr-1 rounded text-foreground/30 hover:text-foreground hover:bg-foreground/5 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
              aria-label="Link options"
            >
              <MoreHorizontal size={16} />
            </button>

            {menuOpen && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMenuOpen(false)}
                />
                <ul className="absolute right-0 top-full mt-1 z-20 bg-white border border-foreground/10 rounded-input shadow-card-hover min-w-[160px] py-1 text-sm">
                  <li>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-foreground/5 w-full text-left"
                    >
                      <ExternalLink size={14} className="text-foreground/50" />
                      Open link
                    </a>
                  </li>
                  <li>
                    <button
                      onClick={() => { setMenuOpen(false); onEdit(link) }}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-foreground/5 w-full text-left"
                    >
                      <Edit2 size={14} className="text-foreground/50" />
                      Edit
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={handleToggleRead}
                      disabled={isTogglingRead}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-foreground/5 w-full text-left disabled:opacity-50"
                    >
                      {link.is_read ? (
                        <><EyeOff size={14} className="text-foreground/50" /> Mark unread</>
                      ) : (
                        <><Eye size={14} className="text-foreground/50" /> Mark as read</>
                      )}
                    </button>
                  </li>
                  <li className="border-t border-foreground/5 mt-1 pt-1">
                    <button
                      onClick={handleDelete}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-red-50 text-red-500 w-full text-left"
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </li>
                </ul>
              </>
            )}
          </div>
          )}
        </div>

        {/* URL */}
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={selectable ? (e) => e.preventDefault() : undefined}
          className="block mt-1.5 text-xs text-accent hover:underline truncate"
        >
          {truncateUrl(link.url)}
        </a>

        {/* Notes */}
        {link.description && (
          <p className="mt-2 text-xs text-foreground/50 line-clamp-2 leading-relaxed">
            {link.description}
          </p>
        )}

        {/* Footer row: category + date + source */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {link.category && (
            <span
              className="px-2 py-0.5 rounded-pill text-xs font-medium"
              style={
                categoryColor
                  ? { backgroundColor: categoryColor + '20', color: categoryColor }
                  : { backgroundColor: 'rgba(196,93,62,0.1)', color: '#C45D3E' }
              }
            >
              {link.category}
            </span>
          )}

          <span className="text-xs text-foreground/35 ml-auto">{relativeDate}</span>

          {link.source === 'instagram_export' && (
            <span className="flex items-center gap-1 text-xs text-foreground/35">
              <Instagram size={11} />
              {link.sender_username ?? 'Instagram'}
            </span>
          )}
        </div>

        {/* Review-mode primary CTA */}
        {reviewMode && !link.is_read && (
          <button
            onClick={handleOpenAndDone}
            disabled={isMarkingDone}
            className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-input bg-accent/10 text-accent text-sm font-medium hover:bg-accent hover:text-white transition-colors disabled:opacity-50"
          >
            <ExternalLink size={14} />
            Open &amp; Done
            {isMarkingDone && <Check size={14} className="ml-1" />}
          </button>
        )}
      </div>
    </div>
  )
}
