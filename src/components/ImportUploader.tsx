'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, FileArchive, AlertCircle, User } from 'lucide-react'
import { autoDetectCurrentUser, parseInstagramExport } from '@/lib/instagram-parser'
import type { ExtractedLink } from '@/lib/types'

interface ImportUploaderProps {
  onParsed: (links: ExtractedLink[], username: string) => void
}

type Stage =
  | { type: 'idle' }
  | { type: 'detecting'; fileName: string }
  | { type: 'needs_name'; file: File; fileName: string }
  | { type: 'parsing'; fileName: string; processed: number; total: number }
  | { type: 'error'; message: string }

export default function ImportUploader({ onParsed }: ImportUploaderProps) {
  const [stage, setStage] = useState<Stage>({ type: 'idle' })
  const [isDragging, setIsDragging] = useState(false)
  const [manualName, setManualName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingFileRef = useRef<File | null>(null)

  const processFile = useCallback(async (file: File, username: string) => {
    const fileName = file.name
    setStage({ type: 'parsing', fileName, processed: 0, total: 0 })

    try {
      const links = await parseInstagramExport(file, username, ({ processed, total }) => {
        setStage({ type: 'parsing', fileName, processed, total })
      })
      onParsed(links, username)
    } catch (err) {
      setStage({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to parse ZIP file.',
      })
    }
  }, [onParsed])

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      setStage({ type: 'error', message: 'Please upload a .zip file from your Instagram data export.' })
      return
    }

    const fileName = file.name
    setStage({ type: 'detecting', fileName })

    const detected = await autoDetectCurrentUser(file)

    if (detected) {
      await processFile(file, detected)
    } else {
      pendingFileRef.current = file
      setStage({ type: 'needs_name', file, fileName })
    }
  }, [processFile])

  const handleManualSubmit = async () => {
    const name = manualName.trim()
    if (!name || !pendingFileRef.current) return
    await processFile(pendingFileRef.current, name)
  }

  // Drag handlers
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = () => setIsDragging(false)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  // ── Render stages ──────────────────────────────────────────────────────────

  if (stage.type === 'detecting') {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center animate-pulse">
          <FileArchive size={22} className="text-accent" />
        </div>
        <p className="text-sm font-medium">Reading {stage.fileName}…</p>
        <p className="text-xs text-foreground/40">Detecting your Instagram username</p>
      </div>
    )
  }

  if (stage.type === 'needs_name') {
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-input text-sm">
          <User size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800">Couldn&apos;t auto-detect your username</p>
            <p className="text-amber-700 mt-0.5">
              Enter your Instagram display name (as it appears in DMs) so we can skip your own messages.
            </p>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5" htmlFor="ig-username">
            Your Instagram display name
          </label>
          <input
            id="ig-username"
            type="text"
            placeholder="e.g. John Smith"
            value={manualName}
            onChange={e => setManualName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleManualSubmit()}
            className="input"
            autoFocus
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setStage({ type: 'idle' }); pendingFileRef.current = null }}
            className="flex-1 py-2.5 rounded-input border border-foreground/15 text-sm font-medium hover:bg-foreground/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleManualSubmit}
            disabled={!manualName.trim()}
            className="flex-1 btn-primary py-2.5 text-sm"
          >
            Continue
          </button>
        </div>
      </div>
    )
  }

  if (stage.type === 'parsing') {
    const pct = stage.total > 0 ? Math.round((stage.processed / stage.total) * 100) : 0
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
          <FileArchive size={22} className="text-accent" />
        </div>
        <div className="w-full max-w-xs">
          <div className="flex justify-between text-xs text-foreground/50 mb-1.5">
            <span>Parsing {stage.fileName}</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 bg-foreground/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-150"
              style={{ width: `${pct || 5}%` }}
            />
          </div>
          {stage.total > 0 && (
            <p className="text-xs text-foreground/40 mt-2">
              {stage.processed} / {stage.total} conversations
            </p>
          )}
        </div>
      </div>
    )
  }

  if (stage.type === 'error') {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-input text-sm">
          <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <p className="text-red-700">{stage.message}</p>
        </div>
        <button
          onClick={() => setStage({ type: 'idle' })}
          className="w-full py-2.5 rounded-input border border-foreground/15 text-sm font-medium hover:bg-foreground/5 transition-colors"
        >
          Try again
        </button>
      </div>
    )
  }

  // ── Idle: drop zone ────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`w-full border-2 border-dashed rounded-card p-10 flex flex-col items-center gap-3 transition-colors cursor-pointer ${
          isDragging
            ? 'border-accent bg-accent/5'
            : 'border-foreground/15 hover:border-accent/50 hover:bg-foreground/2'
        }`}
      >
        <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
          <Upload size={22} className={isDragging ? 'text-accent' : 'text-foreground/40'} />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium">
            {isDragging ? 'Drop it here' : 'Drop your Instagram export ZIP here'}
          </p>
          <p className="text-xs text-foreground/40 mt-1">or click to browse</p>
        </div>
        <span className="px-3 py-1 bg-foreground/5 rounded-pill text-xs text-foreground/50">
          .zip file only
        </span>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        onChange={onFileChange}
        className="hidden"
      />

      <div className="text-xs text-foreground/40 space-y-1 px-1">
        <p className="font-medium text-foreground/60">How to get your Instagram export:</p>
        <ol className="list-decimal list-inside space-y-0.5">
          <li>Go to Instagram Settings → Your Activity</li>
          <li>Download Your Information → Messages</li>
          <li>Select <strong>JSON</strong> format and request download</li>
          <li>Once ready, download and upload the ZIP here</li>
        </ol>
      </div>
    </div>
  )
}
