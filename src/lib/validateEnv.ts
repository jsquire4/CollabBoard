/**
 * Startup environment variable validation.
 * Call from Supabase client factories to fail fast with a clear message
 * instead of a cryptic runtime crash from a `!` non-null assertion.
 */

export function getSupabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url) throw new Error('Missing required env var: NEXT_PUBLIC_SUPABASE_URL')
  if (!anonKey) throw new Error('Missing required env var: NEXT_PUBLIC_SUPABASE_ANON_KEY')
  return { url, anonKey }
}
