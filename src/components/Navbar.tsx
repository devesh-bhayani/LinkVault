'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookmarkPlus, Home, Upload } from 'lucide-react'

const navItems = [
  { href: '/', label: 'Dashboard', icon: Home },
  { href: '/add', label: 'Quick Save', icon: BookmarkPlus },
  { href: '/import', label: 'Import', icon: Upload },
]

export default function Navbar() {
  const pathname = usePathname()

  return (
    <nav className="border-b border-foreground/10 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
        <Link href="/" className="text-lg font-bold text-accent">
          LinkVault
        </Link>
        <div className="flex items-center gap-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-sm font-medium transition-colors ${
                pathname === href
                  ? 'bg-accent text-white'
                  : 'text-foreground/60 hover:text-foreground hover:bg-foreground/5'
              }`}
            >
              <Icon size={16} />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}
