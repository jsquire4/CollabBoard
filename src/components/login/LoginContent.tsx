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
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-50 px-6">
      {/* Background gradients */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(99,102,241,0.15),transparent_50%)]" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_50%_40%_at_80%_90%,rgba(139,92,246,0.08),transparent_50%)]" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:2.5rem_2.5rem]" />

      {/* Card */}
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-10 shadow-xl shadow-slate-200/50 backdrop-blur-sm">
          {/* Logo / back link */}
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-indigo-600"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to home
          </Link>

          <div className="text-center">
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Welcome to CollabBoard
            </h1>
            <p className="mt-3 text-slate-600">
              Sign in with your Google account to start collaborating
            </p>
          </div>

          {authError && (
            <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-center text-sm text-red-700">
              Authentication failed. Please try again.
            </p>
          )}

          <div className="mt-10">
            <GoogleSignInButton onClick={handleLogin} />
          </div>

          <p className="mt-8 text-center text-xs text-slate-400">
            By signing in, you agree to use CollabBoard for real-time collaboration.
          </p>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          New here?{' '}
          <Link href="/" className="font-medium text-indigo-600 hover:text-indigo-500">
            Learn more about CollabBoard
          </Link>
        </p>
      </div>
    </div>
  )
}
