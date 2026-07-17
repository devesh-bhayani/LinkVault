'use client'

import { useState, useEffect } from 'react'
import { Loader2, Lock } from 'lucide-react'
import { signIn, getSession, onAuthChange } from '@/lib/db'

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'authed' | 'anon'>('loading')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSigningIn, setIsSigningIn] = useState(false)

  useEffect(() => {
    getSession().then(({ data }) => {
      setStatus(prev => (prev === 'loading' ? (data.session ? 'authed' : 'anon') : prev))
    })
    return onAuthChange(signedIn => setStatus(signedIn ? 'authed' : 'anon'))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSigningIn(true)
    setError(null)
    const { error } = await signIn(email.trim(), password)
    setIsSigningIn(false)
    if (error) setError(error.message)
    // On success onAuthChange flips status to 'authed'.
  }

  if (status === 'authed') return <>{children}</>

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 size={24} className="text-accent animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-3">
            <Lock size={24} className="text-accent" />
          </div>
          <h1 className="text-xl font-semibold">LinkVault</h1>
          <p className="text-sm text-foreground/50 mt-1">Sign in to your library</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-card shadow-card p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" htmlFor="auth-email">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
              className="input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" htmlFor="auth-password">
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="input"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={isSigningIn || !email.trim() || !password}
            className="w-full btn-primary py-2.5 text-sm flex items-center justify-center gap-2"
          >
            {isSigningIn ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        <p className="text-center text-xs text-foreground/35 mt-4">
          Single-user app — create your account in the Supabase dashboard
          (Authentication → Add user).
        </p>
      </div>
    </div>
  )
}
