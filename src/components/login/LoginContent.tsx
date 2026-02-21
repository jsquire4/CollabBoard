'use client'

import { useState, FormEvent } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { GoogleSignInButton } from '@/components/login/GoogleSignInButton'

function friendlyError(msg: string): string {
  if (msg.includes('Password should contain at least one character of each'))
    return 'Password must include uppercase, lowercase, a number, and a special character.'
  return msg
}

export function LoginContent() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const router = useRouter()
  const authError = searchParams.get('error')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [isSignUp, setIsSignUp] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setEmailError(null)
    setIsLoading(true)

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) {
          setEmailError(friendlyError(error.message))
          return
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
          setEmailError(friendlyError(error.message))
          return
        }
      }
      router.push('/boards')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left panel — navy, hidden on mobile */}
      <div className="hidden lg:flex lg:w-[45%] flex-col items-center justify-center bg-navy px-12 relative overflow-hidden">
        {/* Subtle grid texture overlay */}
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:2rem_2rem]" />

        {/* Brand content */}
        <div className="relative z-10 flex flex-col items-center text-center">
          {/* Decorative leather-colored mark above wordmark */}
          <div className="mb-6 h-px w-12 bg-leather" />

          {/* Theorem wordmark */}
          <span className="font-display text-4xl text-white">Theorem</span>

          {/* Tagline */}
          <p className="mt-4 text-lg text-white/60">Every position begins with a question.</p>
        </div>
      </div>

      {/* Right panel — parchment, full width on mobile */}
      <div className="flex flex-1 flex-col items-center justify-center bg-parchment px-6 py-12">
        <div className="w-full max-w-md">
          {/* Mobile-only brand */}
          <span className="lg:hidden font-display text-2xl text-charcoal mb-8 block">Theorem</span>

          {/* Back to home link */}
          <Link
            href="/"
            className="text-sm text-charcoal/50 hover:text-navy flex items-center gap-1.5 mb-10 transition-colors"
          >
            <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to home
          </Link>

          {/* Heading */}
          <h1 className="font-display text-3xl font-normal text-charcoal sm:text-4xl">
            Welcome to Theorem
          </h1>

          {/* Subtext */}
          <p className="mt-3 text-charcoal/60">
            Sign in to start building.
          </p>

          {/* Auth error banner */}
          {authError && (
            <p role="alert" className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-100">
              Authentication failed. Please try again.
            </p>
          )}

          {/* Google sign-in button */}
          <div className="mt-8">
            <GoogleSignInButton onClick={handleLogin} />
          </div>

          {/* Divider */}
          <div className="mt-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-charcoal/10" />
            <span className="text-xs text-charcoal/40">or</span>
            <div className="h-px flex-1 bg-charcoal/10" />
          </div>

          {/* Email/password form */}
          <form onSubmit={handleEmailSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-charcoal/70">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-charcoal/20 bg-white px-3 py-2 text-sm text-charcoal placeholder:text-charcoal/30 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-charcoal/70">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-charcoal/20 bg-white px-3 py-2 text-sm text-charcoal placeholder:text-charcoal/30 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                placeholder="••••••••"
              />
            </div>

            {emailError && (
              <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-100">
                {emailError}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-navy px-4 py-2.5 text-sm font-medium text-white hover:bg-navy/90 disabled:opacity-50 transition-colors"
            >
              {isLoading ? (isSignUp ? 'Creating account…' : 'Signing in…') : (isSignUp ? 'Create account' : 'Sign in')}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-charcoal/50">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => { setIsSignUp(!isSignUp); setEmailError(null) }}
              className="text-navy hover:underline"
            >
              {isSignUp ? 'Sign in' : 'Sign up'}
            </button>
          </p>

          {/* Footer note */}
          <p className="mt-8 text-xs text-charcoal/40">
            By signing in, you agree to our terms of service.
          </p>
        </div>
      </div>
    </div>
  )
}
