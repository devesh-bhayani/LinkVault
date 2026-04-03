'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Loader2, Tag, FileText, Link2 } from 'lucide-react'
import { updateLink, getCategories } from '@/lib/db'
import type { Link, Category } from '@/lib/types'

interface EditLinkModalProps {
  link: Link
  onSaved: (updated: Link) => void
  onClose: () => void
}

export default function EditLinkModal({ link, onSaved, onClose }: EditLinkModalProps) {
  const [form, setForm] = useState({
    url: link.url,
    title: link.title ?? '',
    category: link.category ?? '',
    description: link.description ?? '',
  })
  const [categories, setCategories] = useState<Category[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Focus title on open
  useEffect(() => {
    titleInputRef.current?.focus()
  }, [])

  // Load categories
  useEffect(() => {
    getCategories().then(({ data }) => { if (data) setCategories(data) })
  }, [])

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Cmd/Ctrl+Enter to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSave() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  async function handleSave() {
    if (!form.url.trim()) return
    setIsSaving(true)
    const { data } = await updateLink(link.id, {
      url: form.url.trim(),
      title: form.title.trim() || null,
      category: form.category.trim() || null,
      description: form.description.trim() || null,
    })
    setIsSaving(false)
    if (data) {
      onSaved(data)
      onClose()
    }
  }

  const filteredCategories = categories.filter(c =>
    c.name.toLowerCase().includes(form.category.toLowerCase())
  )

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Modal panel */}
      <div className="w-full max-w-lg bg-background rounded-card shadow-card-hover animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-foreground/8">
          <h2 className="font-semibold text-base">Edit link</h2>
          <button
            onClick={onClose}
            className="p-1 rounded text-foreground/40 hover:text-foreground hover:bg-foreground/5 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={e => { e.preventDefault(); handleSave() }}
          className="p-5 space-y-4"
        >
          {/* URL */}
          <div>
            <label className="block text-sm font-medium mb-1.5" htmlFor="edit-url">
              URL <span className="text-accent">*</span>
            </label>
            <div className="relative">
              <Link2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40 pointer-events-none" />
              <input
                id="edit-url"
                type="url"
                value={form.url}
                onChange={e => setForm(p => ({ ...p, url: e.target.value }))}
                required
                className="input pl-9"
              />
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium mb-1.5" htmlFor="edit-title">Title</label>
            <input
              ref={titleInputRef}
              id="edit-title"
              type="text"
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              className="input"
            />
          </div>

          {/* Category combobox */}
          <div className="relative">
            <label className="block text-sm font-medium mb-1.5" htmlFor="edit-category">
              <span className="flex items-center gap-1.5"><Tag size={14} /> Category</span>
            </label>
            <input
              id="edit-category"
              type="text"
              value={form.category}
              onChange={e => { setForm(p => ({ ...p, category: e.target.value })); setShowCategoryDropdown(true) }}
              onFocus={() => setShowCategoryDropdown(true)}
              onBlur={() => setTimeout(() => setShowCategoryDropdown(false), 150)}
              className="input"
              autoComplete="off"
            />
            {showCategoryDropdown && filteredCategories.length > 0 && (
              <ul className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-foreground/10 rounded-input shadow-card-hover max-h-40 overflow-y-auto">
                {filteredCategories.map(cat => (
                  <li key={cat.id}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent/5 flex items-center gap-2"
                      onMouseDown={() => { setForm(p => ({ ...p, category: cat.name })); setShowCategoryDropdown(false) }}
                    >
                      {cat.color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />}
                      {cat.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium mb-1.5" htmlFor="edit-description">
              <span className="flex items-center gap-1.5"><FileText size={14} /> Notes</span>
            </label>
            <textarea
              id="edit-description"
              rows={3}
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              className="input resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-input border border-foreground/15 text-sm font-medium hover:bg-foreground/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !form.url.trim()}
              className="flex-1 btn-primary flex items-center justify-center gap-2 py-2.5 text-sm"
            >
              {isSaving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
