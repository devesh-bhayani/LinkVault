import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import '@/styles/globals.css'

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('http://localhost:3000'),
  title: {
    default: 'LinkVault',
    template: '%s — LinkVault',
  },
  description: 'Your personal link library. Save, organize, and search every resource link from Instagram DMs.',
  openGraph: {
    title: 'LinkVault',
    description: 'Your personal link library for Instagram DM resources.',
    type: 'website',
    locale: 'en_US',
  },
  robots: {
    index: false, // personal tool — don't index
    follow: false,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body className="min-h-screen font-sans">
        {children}
      </body>
    </html>
  )
}
