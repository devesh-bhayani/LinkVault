'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Navbar from '@/components/Navbar'
import SearchBar from '@/components/SearchBar'
import CategoryFilter from '@/components/CategoryFilter'
import LinkList from '@/components/LinkList'
import EmptyState from '@/components/EmptyState'
import Toast from '@/components/Toast'
import { getLinks, getCategories, bulkUpdateLinks, bulkDeleteLinks } from '@/lib/db'
import type { Link, Category } from '@/lib/types'
import EditLinkModal from '@/components/EditLinkModal'
import BulkActionBar from '@/components/BulkActionBar'
import { CheckSquare } from 'lucide-react'

const PAGE_SIZE = 50

interface ToastState {
  message: string
  type: 'success' | 'error'
}

export default function DashboardPage() {
  const [links, setLinks] = useState<Link[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [editingLink, setEditingLink] = useState<Link | null>(null)
  const [fetchError, setFetchError] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeSearch = useRef('')
  const activeCategory = useRef<string | null>(null)

  const fetchLinks = useCallback(async (
    searchVal: string,
    categoryVal: string | null,
    offset: number,
    append: boolean
  ) => {
    if (offset === 0) setLoading(true)
    else setLoadingMore(true)

    const { data, count, error } = await getLinks({
      search: searchVal || undefined,
      category: categoryVal ?? undefined,
      limit: PAGE_SIZE,
      offset,
    })

    if (offset === 0) setLoading(false)
    else setLoadingMore(false)

    if (error) {
      setFetchError(true)
      return
    }

    setFetchError(false)
    if (data) {
      setLinks(prev => append ? [...prev, ...data] : data)
      setTotalCount(count ?? 0)
    }
  }, [])

  // Initial load + category changes
  useEffect(() => {
    activeSearch.current = search
    activeCategory.current = selectedCategory
    fetchLinks(search, selectedCategory, 0, false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory])

  // Debounced search
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      activeSearch.current = search
      fetchLinks(search, selectedCategory, 0, false)
    }, 300)
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  // Load categories once
  useEffect(() => {
    getCategories().then(({ data }) => {
      if (data) setCategories(data)
    })
  }, [])

  function handleLoadMore() {
    fetchLinks(activeSearch.current, activeCategory.current, links.length, true)
  }

  function handleEditSaved(updated: Link) {
    setLinks(prev => prev.map(l => l.id === updated.id ? updated : l))
    setToast({ message: 'Link updated.', type: 'success' })
  }

  function handleDeleted(id: string) {
    setLinks(prev => prev.filter(l => l.id !== id))
    setTotalCount(prev => prev - 1)
    setToast({ message: 'Link deleted.', type: 'success' })
  }

  function handleUpdated(updated: Link) {
    setLinks(prev => prev.map(l => l.id === updated.id ? updated : l))
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSelectAll() {
    setSelectedIds(prev => {
      if (prev.size === links.length) return new Set()
      return new Set(links.map(l => l.id))
    })
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  async function bulkSetCategory(category: string | null) {
    const ids = Array.from(selectedIds)
    const { data, error } = await bulkUpdateLinks(ids, { category })
    if (error) {
      setToast({ message: 'Failed to update tags.', type: 'error' })
      return
    }
    if (data) {
      const map = new Map(data.map(d => [d.id, d]))
      setLinks(prev => prev.map(l => map.get(l.id) ?? l))
    }
    setToast({
      message: `${ids.length} link${ids.length !== 1 ? 's' : ''} ${category ? `tagged ${category}` : 'untagged'}.`,
      type: 'success',
    })
    exitSelectMode()
  }

  async function bulkSetRead(isRead: boolean) {
    const ids = Array.from(selectedIds)
    const { data, error } = await bulkUpdateLinks(ids, { is_read: isRead })
    if (error) {
      setToast({ message: 'Failed to update.', type: 'error' })
      return
    }
    if (data) {
      const map = new Map(data.map(d => [d.id, d]))
      setLinks(prev => prev.map(l => map.get(l.id) ?? l))
    }
    setToast({
      message: `${ids.length} link${ids.length !== 1 ? 's' : ''} marked ${isRead ? 'read' : 'unread'}.`,
      type: 'success',
    })
    exitSelectMode()
  }

  async function bulkDelete() {
    const ids = Array.from(selectedIds)
    const { error } = await bulkDeleteLinks(ids)
    if (error) {
      setToast({ message: 'Failed to delete.', type: 'error' })
      return
    }
    const idSet = new Set(ids)
    setLinks(prev => prev.filter(l => !idSet.has(l.id)))
    setTotalCount(prev => Math.max(0, prev - ids.length))
    setToast({ message: `${ids.length} link${ids.length !== 1 ? 's' : ''} deleted.`, type: 'success' })
    exitSelectMode()
  }

  const hasMore = links.length < totalCount
  const isFiltering = !!search || !!selectedCategory
  const isEmpty = !loading && links.length === 0

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Search */}
        <div className="mb-4">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search by title, URL, notes, tag, or sender…"
          />
        </div>

        {/* Category filter */}
        {categories.length > 0 && (
          <div className="mb-6">
            <CategoryFilter
              categories={categories}
              selected={selectedCategory}
              onSelect={cat => {
                setSelectedCategory(cat)
                activeCategory.current = cat
              }}
            />
          </div>
        )}

        {/* Results count + select toggle */}
        {!loading && totalCount > 0 && (
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-foreground/40">
              {totalCount} {totalCount === 1 ? 'link' : 'links'}
              {isFiltering && ' found'}
            </p>
            {!selectMode && (
              <button
                onClick={() => setSelectMode(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-xs font-medium text-foreground/60 hover:bg-foreground/5 transition-colors"
              >
                <CheckSquare size={13} />
                Select
              </button>
            )}
          </div>
        )}

        {/* DB error */}
        {fetchError && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-card text-sm mb-4">
            <span className="text-red-400 shrink-0 mt-0.5">⚠</span>
            <div>
              <p className="font-medium text-red-700">Couldn&apos;t load links</p>
              <p className="text-red-500 mt-0.5 text-xs">
                Check your Supabase connection in <code className="bg-red-100 px-1 rounded">.env.local</code>, then{' '}
                <button onClick={() => fetchLinks('', null, 0, false)} className="underline">retry</button>.
              </p>
            </div>
          </div>
        )}

        {/* Link grid */}
        <LinkList
          links={links}
          categories={categories}
          loading={loading}
          selectable={selectMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onDeleted={handleDeleted}
          onUpdated={handleUpdated}
          onEdit={setEditingLink}
        />

        {/* Empty state */}
        {isEmpty && !isFiltering && <EmptyState />}

        {isEmpty && isFiltering && (
          <div className="py-16 text-center text-foreground/40 text-sm">
            No links match your search.
          </div>
        )}

        {/* Load more */}
        {hasMore && !loading && (
          <div className="mt-8 flex justify-center">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="px-6 py-2.5 rounded-input border border-foreground/15 text-sm font-medium hover:bg-foreground/5 disabled:opacity-50 transition-colors"
            >
              {loadingMore ? 'Loading…' : `Load more (${totalCount - links.length} remaining)`}
            </button>
          </div>
        )}
      </main>

      {selectMode && (
        <BulkActionBar
          count={selectedIds.size}
          totalVisible={links.length}
          categories={categories}
          onSetCategory={bulkSetCategory}
          onSetRead={bulkSetRead}
          onDelete={bulkDelete}
          onSelectAll={handleSelectAll}
          onCancel={exitSelectMode}
        />
      )}

      {editingLink && (
        <EditLinkModal
          link={editingLink}
          onSaved={handleEditSaved}
          onClose={() => setEditingLink(null)}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}
