'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { GoogleSignInButton } from '@/components/login/GoogleSignInButton'

export function LoginContent() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const authError = searchParams.get('error')

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <div className="flex min-h-screen">
      {/* Left panel — navy, hidden on mobile */}
      <div className="hidden lg:flex lg:w-[45%] flex-col items-center justify-center bg-navy px-12 relative overflow-hidden">
        {/* Subtle grid texture overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:2rem_2rem]" />

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
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
            Sign in with your Google account to start building.
          </p>

          {/* Auth error banner */}
          {authError && (
            <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-100">
              Authentication failed. Please try again.
            </p>
          )}

          {/* Google sign-in button */}
          <div className="mt-8">
            <GoogleSignInButton onClick={handleLogin} />
          </div>

          {/* Footer note */}
          <p className="mt-8 text-xs text-charcoal/40">
            By signing in, you agree to our terms of service.
          </p>
        </div>
      </div>
    </div>
  )
}
