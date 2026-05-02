'use client'

import { useState, useRef, useEffect } from 'react'
import { Download, FileText, FileJson, Loader2 } from 'lucide-react'
import { getAllLinks } from '@/lib/db'
import { exportLinksAsCsv, exportLinksAsJson } from '@/lib/export'

interface ExportMenuProps {
  onError?: (message: string) => void
  onSuccess?: (message: string) => void
}

export default function ExportMenu({ onError, onSuccess }: ExportMenuProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<'csv' | 'json' | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  async function run(format: 'csv' | 'json') {
    setBusy(format)
    setOpen(false)
    try {
      const links = await getAllLinks()
      if (links.length === 0) {
        onError?.('No links to export.')
        return
      }
      if (format === 'csv') exportLinksAsCsv(links)
      else exportLinksAsJson(links)
      onSuccess?.(`Exported ${links.length} link${links.length !== 1 ? 's' : ''} as ${format.toUpperCase()}.`)
    } catch {
      onError?.('Export failed.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen(v => !v)}
        disabled={!!busy}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-xs font-medium text-foreground/60 hover:bg-foreground/5 transition-colors disabled:opacity-50"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
        Export
      </button>

      {open && (
        <ul className="absolute right-0 top-full mt-1 z-20 bg-white border border-foreground/10 rounded-input shadow-card-hover min-w-[160px] py-1 text-sm">
          <li>
            <button
              onClick={() => run('csv')}
              className="flex items-center gap-2 px-3 py-2 hover:bg-foreground/5 w-full text-left"
            >
              <FileText size={14} className="text-foreground/50" />
              Download CSV
            </button>
          </li>
          <li>
            <button
              onClick={() => run('json')}
              className="flex items-center gap-2 px-3 py-2 hover:bg-foreground/5 w-full text-left"
            >
              <FileJson size={14} className="text-foreground/50" />
              Download JSON
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}
