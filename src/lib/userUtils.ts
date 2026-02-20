import type { User } from '@supabase/supabase-js'

export function getUserDisplayName(user: User): string {
  return (user.user_metadata?.full_name as string) ?? user.user_metadata?.name ?? user.email?.split('@')[0] ?? 'Unknown'
}
