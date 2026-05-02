'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookmarkPlus, Home, Upload, Inbox } from 'lucide-react'
import { getUnreadCount } from '@/lib/db'

const navItems = [
  { href: '/', label: 'Dashboard', icon: Home },
  { href: '/add', label: 'Quick Save', icon: BookmarkPlus },
  { href: '/review', label: 'Review', icon: Inbox, showBadge: true },
  { href: '/import', label: 'Import', icon: Upload },
]

export default function Navbar() {
  const pathname = usePathname()
  const [unread, setUnread] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    getUnreadCount().then(n => { if (!cancelled) setUnread(n) })
    return () => { cancelled = true }
  }, [pathname])

  return (
    <nav className="border-b border-foreground/10 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
        <Link href="/" className="text-lg font-bold text-accent">
          LinkVault
        </Link>
        <div className="flex items-center gap-1">
          {navItems.map(({ href, label, icon: Icon, showBadge }) => {
            const isActive = pathname === href
            const showCount = showBadge && unread !== null && unread > 0
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-accent text-white'
                    : 'text-foreground/60 hover:text-foreground hover:bg-foreground/5'
                }`}
              >
                <Icon size={16} />
                <span className="hidden sm:inline">{label}</span>
                {showCount && (
                  <span
                    className={`ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold ${
                      isActive ? 'bg-white text-accent' : 'bg-accent text-white'
                    }`}
                  >
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
