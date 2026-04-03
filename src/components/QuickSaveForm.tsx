'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, Link2, Tag, FileText, Sparkles } from 'lucide-react'
import { createLink } from '@/lib/db'
import { getCategories } from '@/lib/db'
import { fetchMetadata } from '@/lib/metadata-fetcher'
import type { Category } from '@/lib/types'
import Toast from './Toast'

interface ToastState {
  message: string
  type: 'success' | 'error'
}

const EMPTY_FORM = {
  url: '',
  title: '',
  category: '',
  description: '',
}

export default function QuickSaveForm() {
  const [form, setForm] = useState(EMPTY_FORM)
  const [categories, setCategories] = useState<Category[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isFetchingMeta, setIsFetchingMeta] = useState(false)
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  const urlInputRef = useRef<HTMLInputElement>(null)
  const metaDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const categoryInputRef = useRef<HTMLInputElement>(null)

  // Auto-focus URL on mount
  useEffect(() => {
    urlInputRef.current?.focus()
  }, [])

  // Load categories once
  useEffect(() => {
    getCategories().then(({ data }) => {
      if (data) setCategories(data)
    })
  }, [])

  // Cmd/Ctrl+Enter to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSubmit()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  const autoFetchMeta = useCallback((url: string) => {
    if (metaDebounceRef.current) clearTimeout(metaDebounceRef.current)
    if (!url.startsWith('http')) return

    metaDebounceRef.current = setTimeout(async () => {
      setIsFetchingMeta(true)
      const meta = await fetchMetadata(url)
      setIsFetchingMeta(false)
      if (meta.title) {
        setForm(prev => ({
          ...prev,
          title: prev.title || meta.title!,
          description: prev.description || meta.description || '',
        }))
      }
    }, 500)
  }, [])

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value
    setForm(prev => ({ ...prev, url }))
    autoFetchMeta(url)
  }

  const handleUrlBlur = () => {
    if (form.url && !isFetchingMeta) {
      // Re-trigger if debounce hasn't fired yet
      autoFetchMeta(form.url)
    }
  }

  const handleSubmit = async () => {
    if (!form.url.trim()) {
      urlInputRef.current?.focus()
      return
    }

    setIsSaving(true)
    const { error } = await createLink({
      url: form.url.trim(),
      title: form.title.trim() || null,
      description: form.description.trim() || null,
      category: form.category.trim() || null,
      source: 'manual',
      sender_username: null,
      sender_message_context: null,
      original_timestamp: null,
      is_read: false,
    })
    setIsSaving(false)

    if (error) {
      setToast({ message: 'Failed to save link. Try again.', type: 'error' })
    } else {
      setToast({ message: 'Link saved!', type: 'success' })
      setForm(EMPTY_FORM)
      urlInputRef.current?.focus()
    }
  }

  const filteredCategories = categories.filter(c =>
    c.name.toLowerCase().includes(form.category.toLowerCase())
  )

  return (
    <>
      <form
        onSubmit={e => { e.preventDefault(); handleSubmit() }}
        className="space-y-5"
      >
        {/* URL */}
        <div>
          <label className="block text-sm font-medium mb-1.5" htmlFor="url">
            URL <span className="text-accent">*</span>
          </label>
          <div className="relative">
            <Link2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40 pointer-events-none" />
            <input
              ref={urlInputRef}
              id="url"
              type="url"
              placeholder="https://example.com/resource"
              value={form.url}
              onChange={handleUrlChange}
              onBlur={handleUrlBlur}
              required
              className="input pl-9 pr-9"
            />
            {isFetchingMeta && (
              <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-accent animate-spin" />
            )}
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-medium mb-1.5" htmlFor="title">
            <span className="flex items-center gap-1.5">
              Title
              {isFetchingMeta && (
                <span className="text-xs text-accent font-normal flex items-center gap-1">
                  <Sparkles size={11} /> Fetching…
                </span>
              )}
            </span>
          </label>
          <input
            id="title"
            type="text"
            placeholder="Auto-filled from URL, or add your own"
            value={form.title}
            onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
            className="input"
          />
        </div>

        {/* Category combobox */}
        <div className="relative">
          <label className="block text-sm font-medium mb-1.5" htmlFor="category">
            <span className="flex items-center gap-1.5">
              <Tag size={14} />
              Category
            </span>
          </label>
          <input
            ref={categoryInputRef}
            id="category"
            type="text"
            placeholder="Coding, Design, Finance… or type a new one"
            value={form.category}
            onChange={e => {
              setForm(prev => ({ ...prev, category: e.target.value }))
              setShowCategoryDropdown(true)
            }}
            onFocus={() => setShowCategoryDropdown(true)}
            onBlur={() => setTimeout(() => setShowCategoryDropdown(false), 150)}
            className="input"
            autoComplete="off"
          />
          {showCategoryDropdown && filteredCategories.length > 0 && (
            <ul className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-foreground/10 rounded-input shadow-card-hover max-h-48 overflow-y-auto">
              {filteredCategories.map(cat => (
                <li key={cat.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent/5 flex items-center gap-2"
                    onMouseDown={() => {
                      setForm(prev => ({ ...prev, category: cat.name }))
                      setShowCategoryDropdown(false)
                    }}
                  >
                    {cat.color && (
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                    )}
                    {cat.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium mb-1.5" htmlFor="description">
            <span className="flex items-center gap-1.5">
              <FileText size={14} />
              Notes
            </span>
          </label>
          <textarea
            id="description"
            rows={3}
            placeholder="Why did you save this? Any context…"
            value={form.description}
            onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
            className="input resize-none"
          />
        </div>

        {/* Save button */}
        <button
          type="submit"
          disabled={isSaving || !form.url.trim()}
          className="w-full btn-primary flex items-center justify-center gap-2 py-3.5 text-base"
        >
          {isSaving ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Saving…
            </>
          ) : (
            <>
              Save Link
              <span className="ml-1 text-xs opacity-70 font-normal">⌘↵</span>
            </>
          )}
        </button>
      </form>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </>
  )
}
