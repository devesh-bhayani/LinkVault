import Link from 'next/link'
import { Home, Search } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <p className="text-7xl font-bold text-accent/20 leading-none">404</p>
        <h1 className="mt-4 text-xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-foreground/50">
          This page doesn&apos;t exist. Maybe the link was wrong or has moved.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2">
          <Link
            href="/"
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-input bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            <Home size={15} />
            Go home
          </Link>
          <Link
            href="/add"
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-input border border-foreground/15 text-sm font-medium hover:bg-foreground/5 transition-colors"
          >
            <Search size={15} />
            Save a link
          </Link>
        </div>
      </div>
    </div>
  )
}
