'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Inbox, ArrowUpDown, CheckCircle2 } from 'lucide-react'
import Navbar from '@/components/Navbar'
import LinkList from '@/components/LinkList'
import Toast from '@/components/Toast'
import EditLinkModal from '@/components/EditLinkModal'
import { getLinks, getCategories } from '@/lib/db'
import type { Link as LinkType, Category } from '@/lib/types'

const PAGE_SIZE = 50

interface ToastState {
  message: string
  type: 'success' | 'error'
}

export default function ReviewPage() {
  const [links, setLinks] = useState<LinkType[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [oldestFirst, setOldestFirst] = useState(true)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [editingLink, setEditingLink] = useState<LinkType | null>(null)
  const [fetchError, setFetchError] = useState(false)

  const fetchUnread = useCallback(async (offset: number, append: boolean, ascending: boolean) => {
    if (offset === 0) setLoading(true)
    else setLoadingMore(true)

    const { data, count, error } = await getLinks({
      unreadOnly: true,
      ascending,
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

  useEffect(() => {
    fetchUnread(0, false, oldestFirst)
  }, [oldestFirst, fetchUnread])

  useEffect(() => {
    getCategories().then(({ data }) => {
      if (data) setCategories(data)
    })
  }, [])

  function handleLoadMore() {
    fetchUnread(links.length, true, oldestFirst)
  }

  function handleDeleted(id: string) {
    setLinks(prev => prev.filter(l => l.id !== id))
    setTotalCount(prev => prev - 1)
    setToast({ message: 'Link deleted.', type: 'success' })
  }

  function handleUpdated(updated: LinkType) {
    if (updated.is_read) {
      setLinks(prev => prev.filter(l => l.id !== updated.id))
      setTotalCount(prev => Math.max(0, prev - 1))
    } else {
      setLinks(prev => prev.map(l => l.id === updated.id ? updated : l))
    }
  }

  function handleEditSaved(updated: LinkType) {
    handleUpdated(updated)
    setToast({ message: 'Link updated.', type: 'success' })
  }

  const hasMore = links.length < totalCount
  const isEmpty = !loading && links.length === 0

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Inbox size={22} className="text-accent" />
              Review queue
            </h1>
            <p className="text-foreground/50 mt-1 text-sm">
              Links you haven&apos;t opened yet. Use them or mark them done.
            </p>
          </div>

          {totalCount > 0 && (
            <button
              onClick={() => setOldestFirst(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-pill border border-foreground/15 text-xs font-medium text-foreground/60 hover:bg-foreground/5 transition-colors"
              title="Toggle sort order"
            >
              <ArrowUpDown size={13} />
              {oldestFirst ? 'Oldest first' : 'Newest first'}
            </button>
          )}
        </div>

        {!loading && totalCount > 0 && (
          <p className="text-xs text-foreground/40 mb-4">
            {totalCount} unread {totalCount === 1 ? 'link' : 'links'}
          </p>
        )}

        {fetchError && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-card text-sm mb-4">
            <span className="text-red-400 shrink-0 mt-0.5">⚠</span>
            <div>
              <p className="font-medium text-red-700">Couldn&apos;t load links</p>
              <p className="text-red-500 mt-0.5 text-xs">
                Check your Supabase connection in <code className="bg-red-100 px-1 rounded">.env.local</code>, then{' '}
                <button onClick={() => fetchUnread(0, false, oldestFirst)} className="underline">retry</button>.
              </p>
            </div>
          </div>
        )}

        <LinkList
          links={links}
          categories={categories}
          loading={loading}
          reviewMode
          onDeleted={handleDeleted}
          onUpdated={handleUpdated}
          onEdit={setEditingLink}
        />

        {isEmpty && (
          <div className="py-16 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <CheckCircle2 size={28} className="text-green-600" />
            </div>
            <h2 className="text-lg font-semibold mb-1">Inbox zero</h2>
            <p className="text-sm text-foreground/50 max-w-sm">
              You&apos;ve been through every saved link. Nice. Save more from your{' '}
              <Link href="/add" className="text-accent underline">Quick Save</Link> page or run an{' '}
              <Link href="/import" className="text-accent underline">Instagram import</Link>.
            </p>
          </div>
        )}

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
