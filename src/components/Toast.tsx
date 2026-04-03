'use client'

import { useEffect } from 'react'
import { CheckCircle, XCircle, X } from 'lucide-react'

interface ToastProps {
  message: string
  type?: 'success' | 'error'
  onClose: () => void
  duration?: number
}

export default function Toast({ message, type = 'success', onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration)
    return () => clearTimeout(timer)
  }, [onClose, duration])

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
      <div className="flex items-center gap-2 px-4 py-3 bg-white rounded-card shadow-card-hover border border-foreground/10">
        {type === 'success' ? (
          <CheckCircle size={18} className="text-green-500 shrink-0" />
        ) : (
          <XCircle size={18} className="text-red-500 shrink-0" />
        )}
        <span className="text-sm">{message}</span>
        <button onClick={onClose} className="ml-2 text-foreground/40 hover:text-foreground">
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
