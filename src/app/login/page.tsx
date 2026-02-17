'use client'

import { createClient } from '@/lib/supabase/client'
import { GoogleSignInButton } from '@/components/login/GoogleSignInButton'

export default function LoginPage() {
  const supabase = createClient()

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Sign in to CollabBoard
          </h1>
          <p className="mt-2 text-slate-600">
            Use your Google account to get started
          </p>
        </div>
        <div className="flex justify-center">
          <GoogleSignInButton onClick={handleLogin} />
        </div>
      </div>
    </div>
  )
}
