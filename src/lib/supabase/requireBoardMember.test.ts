/**
 * Tests for requireBoardMember — shared board membership check for API routes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { requireBoardMember } from './requireBoardMember'

function createMockSupabase(maybeSingleResult: { data: { role: string; can_use_agents?: boolean } | null }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(maybeSingleResult),
  }
  return {
    from: vi.fn().mockReturnValue(chain),
  } as unknown as Parameters<typeof requireBoardMember>[0]
}

describe('requireBoardMember', () => {
  const BOARD_ID = '11111111-1111-1111-1111-111111111111'
  const USER_ID = 'user-abc-123'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when no member row exists', async () => {
    const supabase = createMockSupabase({ data: null })
    const result = await requireBoardMember(supabase, BOARD_ID, USER_ID)
    expect(result).toBeNull()
  })

  it('returns member when found and no options given', async () => {
    const supabase = createMockSupabase({
      data: { role: 'editor', can_use_agents: true },
    })
    const result = await requireBoardMember(supabase, BOARD_ID, USER_ID)
    expect(result).toEqual({ role: 'editor', can_use_agents: true })
  })

  it('returns member when role is in allowedRoles', async () => {
    const supabase = createMockSupabase({
      data: { role: 'manager', can_use_agents: true },
    })
    const result = await requireBoardMember(supabase, BOARD_ID, USER_ID, {
      allowedRoles: ['owner', 'manager'],
    })
    expect(result).toEqual({ role: 'manager', can_use_agents: true })
  })

  it('returns null when role is not in allowedRoles', async () => {
    const supabase = createMockSupabase({
      data: { role: 'viewer', can_use_agents: false },
    })
    const result = await requireBoardMember(supabase, BOARD_ID, USER_ID, {
      allowedRoles: ['owner', 'manager'],
    })
    expect(result).toBeNull()
  })

  it('returns null when requireAgents is true and can_use_agents is false', async () => {
    const supabase = createMockSupabase({
      data: { role: 'editor', can_use_agents: false },
    })
    const result = await requireBoardMember(supabase, BOARD_ID, USER_ID, {
      requireAgents: true,
    })
    expect(result).toBeNull()
  })

  it('returns member when requireAgents is true and can_use_agents is true', async () => {
    const supabase = createMockSupabase({
      data: { role: 'editor', can_use_agents: true },
    })
    const result = await requireBoardMember(supabase, BOARD_ID, USER_ID, {
      requireAgents: true,
    })
    expect(result).toEqual({ role: 'editor', can_use_agents: true })
  })
})
