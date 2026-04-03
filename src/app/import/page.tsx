'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle, Home, BookmarkPlus } from 'lucide-react'
import Navbar from '@/components/Navbar'
import ImportUploader from '@/components/ImportUploader'
import ImportPreview from '@/components/ImportPreview'
import { bulkCreateLinks, getExistingUrls } from '@/lib/db'
import type { ExtractedLink } from '@/lib/types'

// ── Types ──────────────────────────────────────────────────────────────────────
interface PreviewItem extends ExtractedLink {
  alreadySaved: boolean
}

type Stage =
  | { type: 'upload' }
  | { type: 'preview'; items: PreviewItem[]; username: string }
  | { type: 'done'; imported: number; skipped: number }

// ── Page ───────────────────────────────────────────────────────────────────────
export default function ImportPage() {
  const [stage, setStage] = useState<Stage>({ type: 'upload' })

  async function handleParsed(links: ExtractedLink[], username: string) {
    if (links.length === 0) {
      setStage({ type: 'done', imported: 0, skipped: 0 })
      return
    }

    // Check which URLs already exist in DB
    const existing = await getExistingUrls(links.map(l => l.url))

    const items: PreviewItem[] = links.map(l => ({
      ...l,
      alreadySaved: existing.has(l.url),
    }))

    setStage({ type: 'preview', items, username })
  }

  async function handleConfirm(selected: ExtractedLink[]) {
    const inserts = selected.map(l => ({
      url: l.url,
      title: null,
      description: l.messageContext || null,
      category: null,
      source: 'instagram_export' as const,
      sender_username: l.senderUsername,
      sender_message_context: l.messageContext,
      original_timestamp: l.originalTimestamp.toISOString(),
      is_read: false,
    }))

    const { data } = await bulkCreateLinks(inserts)
    const imported = data?.length ?? selected.length
    const skipped = selected.length - imported

    setStage({ type: 'done', imported, skipped })
  }

  const stepLabel =
    stage.type === 'upload' ? 'Upload' :
    stage.type === 'preview' ? 'Review' : 'Done'

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="max-w-2xl mx-auto px-4 py-8 pb-16">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Import from Instagram</h1>
          <p className="text-foreground/50 mt-1 text-sm">
            Upload your Instagram data export ZIP to batch-import links from your DMs.
          </p>
        </div>

        {/* Step indicator */}
        {stage.type !== 'done' && (
          <div className="flex items-center gap-2 mb-6">
            {['Upload', 'Review', 'Done'].map((label, i) => {
              const stepIndex = stage.type === 'upload' ? 0 : stage.type === 'preview' ? 1 : 2
              const isActive = i === stepIndex
              const isDone = i < stepIndex
              return (
                <div key={label} className="flex items-center gap-2">
                  {i > 0 && <div className="w-8 h-px bg-foreground/15" />}
                  <div className={`flex items-center gap-1.5 text-xs font-medium ${
                    isActive ? 'text-accent' : isDone ? 'text-foreground/40' : 'text-foreground/25'
                  }`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                      isActive ? 'bg-accent text-white' :
                      isDone ? 'bg-foreground/15 text-foreground/50' :
                      'border border-foreground/20 text-foreground/30'
                    }`}>
                      {i + 1}
                    </span>
                    {label}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Stage content */}
        <div className="bg-white rounded-card shadow-card p-6">
          {stage.type === 'upload' && (
            <ImportUploader onParsed={handleParsed} />
          )}

          {stage.type === 'preview' && (
            <ImportPreview
              items={stage.items}
              onConfirm={handleConfirm}
              onBack={() => setStage({ type: 'upload' })}
            />
          )}

          {stage.type === 'done' && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle size={28} className="text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Import complete</h2>
                <p className="text-sm text-foreground/50 mt-1">
                  {stage.imported > 0
                    ? `${stage.imported} link${stage.imported !== 1 ? 's' : ''} saved to your library.`
                    : 'No new links were found.'}
                  {stage.skipped > 0 && ` ${stage.skipped} already existed.`}
                </p>
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => setStage({ type: 'upload' })}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-input border border-foreground/15 text-sm font-medium hover:bg-foreground/5 transition-colors"
                >
                  Import another
                </button>
                <Link
                  href="/"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-input bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
                >
                  <Home size={15} />
                  View library
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Help text — only on upload step */}
        {stage.type === 'upload' && (
          <p className="text-center text-xs text-foreground/35 mt-4">
            Your file is processed entirely in your browser — nothing is uploaded to any server.
          </p>
        )}
      </main>
    </div>
  )
}
