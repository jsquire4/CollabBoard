'use client'

import { useState, type FormEvent, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

function friendlyError(msg: string): string {
  if (msg.includes('Password should contain at least one character of each'))
    return 'Password must include uppercase, lowercase, a number, and a special character.'
  return msg
}

export function ResetPasswordContent() {
  const supabase = createClient()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [isInvalidLink, setIsInvalidLink] = useState(false)

  useEffect(() => {
    const checkSession = () => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setIsReady(true)
          return
        }
        const hash = typeof window !== 'undefined' ? window.location.hash : ''
        if (hash?.includes('type=recovery')) {
          setIsReady(true)
        } else {
          setIsInvalidLink(true)
        }
      })
    }
    checkSession()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkSession()
    })
    return () => subscription?.unsubscribe()
  }, [supabase])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    setIsLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(friendlyError(updateError.message))
        return
      }
      router.push('/boards')
    } finally {
      setIsLoading(false)
    }
  }

  if (isInvalidLink) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-parchment px-6">
        <div className="w-full max-w-md text-center">
          <h1 className="font-display text-2xl font-normal text-charcoal">Invalid or expired link</h1>
          <p className="mt-3 text-charcoal/70">
            This password reset link is invalid or has expired. Please request a new one.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-lg bg-navy px-4 py-2.5 text-sm font-medium text-white hover:bg-navy/90"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-parchment">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-parchment-border border-t-navy" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden lg:flex lg:w-[45%] flex-col items-center justify-center bg-navy px-12 relative overflow-hidden">
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:2rem_2rem]" />
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="mb-6 h-px w-12 bg-leather" />
          <span className="font-display text-4xl text-white">Theorem</span>
          <p className="mt-4 text-lg text-white/60">Every position begins with a question.</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center bg-parchment px-6 py-12">
        <div className="w-full max-w-md">
          <span className="lg:hidden font-display text-2xl text-charcoal mb-8 block">Theorem</span>

          <Link
            href="/login"
            className="text-sm text-charcoal/50 hover:text-navy flex items-center gap-1.5 mb-10 transition-colors"
          >
            <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to sign in
          </Link>

          <h1 className="font-display text-3xl font-normal text-charcoal sm:text-4xl">
            Set new password
          </h1>
          <p className="mt-3 text-charcoal/60">
            Enter your new password below.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-charcoal/70">
                New password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-charcoal/20 bg-white px-3 py-2 text-sm text-charcoal placeholder:text-charcoal/30 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-charcoal/70">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-charcoal/20 bg-white px-3 py-2 text-sm text-charcoal placeholder:text-charcoal/30 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-100">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-navy px-4 py-2.5 text-sm font-medium text-white hover:bg-navy/90 disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
