import { createBrowserClient } from '@supabase/ssr'
import { getSupabaseEnv } from '@/lib/validateEnv'

export function createClient() {
  const { url, anonKey } = getSupabaseEnv()
  return createBrowserClient(url, anonKey)
}