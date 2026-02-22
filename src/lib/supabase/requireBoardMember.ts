/**
 * Shared board membership check used by all API routes.
 *
 * Uses .maybeSingle() instead of .single() so that a missing row returns
 * { data: null, error: null } rather than throwing / returning a query error.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

interface MembershipOptions {
  /** If set, the member's role must be one of these values. */
  allowedRoles?: string[]
  /** If true, member.can_use_agents must be true. */
  requireAgents?: boolean
}

interface MemberRow {
  role: string
  can_use_agents?: boolean
}

/**
 * Returns the member row if the user belongs to the board and satisfies
 * the given role/agent constraints, or null otherwise.
 *
 * @param supabase  Any Supabase client (user or admin).
 * @param boardId   The board to check membership in.
 * @param userId    The user to look up.
 * @param options   Optional role and agent-permission constraints.
 */
export async function requireBoardMember(
  supabase: SupabaseClient,
  boardId: string,
  userId: string,
  options: MembershipOptions = {},
): Promise<MemberRow | null> {
  // Always select both fields; the extra column costs nothing and avoids
  // Supabase's conditional type inference breaking on a dynamic select string.
  const { data: member } = await supabase
    .from('board_members')
    .select('role, can_use_agents')
    .eq('board_id', boardId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!member) return null

  const row = member as unknown as MemberRow
  if (options.allowedRoles && !options.allowedRoles.includes(row.role)) return null
  if (options.requireAgents && !row.can_use_agents) return null

  return row
}
