import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/boards'

  // Only allow relative redirects to prevent open redirect attacks
  // Reject protocol-relative (//evil.com) and non-path values
  const redirectPath =
    next.startsWith('/') && !next.startsWith('//') ? next : '/boards'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${redirectPath}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
