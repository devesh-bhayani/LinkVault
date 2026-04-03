'use client'

import { useEffect } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto">
          <AlertCircle size={26} className="text-red-400" />
        </div>
        <h1 className="mt-4 text-lg font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-foreground/50">
          An unexpected error occurred. Try refreshing — if it keeps happening,
          check your Supabase connection in <code className="text-xs bg-foreground/5 px-1 py-0.5 rounded">.env.local</code>.
        </p>
        <button
          onClick={reset}
          className="mt-6 flex items-center gap-1.5 px-4 py-2.5 rounded-input bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors mx-auto"
        >
          <RefreshCw size={15} />
          Try again
        </button>
      </div>
    </div>
  )
}
