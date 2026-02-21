/**
 * Tests for GET /invite/accept
 * Critical paths: missing/invalid token, unauthenticated redirect,
 * invite not found, email mismatch, successful accept, idempotent accept.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Hoisted mock fns ─────────────────────────────────────────────────────────

const {
  TEST_INVITE_ID,
  TEST_BOARD_ID,
  TEST_USER_ID,
  mockGetUser,
  mockAdminFrom,
} = vi.hoisted(() => ({
  TEST_INVITE_ID: '22222222-2222-2222-2222-222222222222',
  TEST_BOARD_ID: '11111111-1111-1111-1111-111111111111',
  TEST_USER_ID: 'user-abc-123',
  mockGetUser: vi.fn(),
  mockAdminFrom: vi.fn(),
}))

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
  })),
}))

// ── Import route AFTER mocks ─────────────────────────────────────────────────

import { GET } from './route'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(id?: string): NextRequest {
  const url = id
    ? `http://localhost/invite/accept?id=${id}`
    : 'http://localhost/invite/accept'
  return new NextRequest(url, { method: 'GET' })
}

function mockInviteLookup(data: unknown = null, error: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
  }
}

function mockMemberUpsert(error: unknown = null) {
  return {
    upsert: vi.fn().mockResolvedValue({ error }),
  }
}

function mockInviteDelete() {
  return {
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  }
}

const MOCK_INVITE = {
  id: TEST_INVITE_ID,
  board_id: TEST_BOARD_ID,
  email: 'invitee@example.com',
  role: 'editor',
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe('GET /invite/accept', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default: authenticated user
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: TEST_USER_ID,
          email: 'invitee@example.com',
        },
      },
      error: null,
    })

    // Default: invite found, member upsert succeeds, delete succeeds
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'board_invites') {
        return {
          ...mockInviteLookup(MOCK_INVITE),
          ...mockInviteDelete(),
        }
      }
      if (table === 'board_members') return mockMemberUpsert()
      return {}
    })
  })

  // ── Missing/invalid token ──────────────────────────────────────────────────

  describe('missing or invalid token', () => {
    it('redirects to /boards?error=invite-invalid when id param is absent', async () => {
      const res = await GET(makeRequest())
      expect(res.status).toBe(307)
      expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('invite-invalid')
    })

    it('redirects to /boards?error=invite-invalid when id is not a UUID', async () => {
      const res = await GET(makeRequest('not-a-uuid'))
      expect(res.status).toBe(307)
      expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('invite-invalid')
    })

    it('redirects to /boards?error=invite-invalid when id is empty', async () => {
      const req = new NextRequest('http://localhost/invite/accept?id=', { method: 'GET' })
      const res = await GET(req)
      expect(res.status).toBe(307)
      expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('invite-invalid')
    })
  })

  // ── Unauthenticated user ───────────────────────────────────────────────────

  describe('unauthenticated user', () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    })

    it('redirects to /login with returnTo containing the invite accept URL', async () => {
      const res = await GET(makeRequest(TEST_INVITE_ID))
      expect(res.status).toBe(307)
      const location = new URL(res.headers.get('location')!)
      expect(location.pathname).toBe('/login')
      const returnTo = location.searchParams.get('returnTo')
      expect(returnTo).toContain('/invite/accept')
      expect(returnTo).toContain(TEST_INVITE_ID)
    })

    it('preserves the exact invite ID in the returnTo param', async () => {
      const res = await GET(makeRequest(TEST_INVITE_ID))
      const location = new URL(res.headers.get('location')!)
      const returnTo = location.searchParams.get('returnTo')!
      expect(returnTo).toBe(`/invite/accept?id=${TEST_INVITE_ID}`)
    })
  })

  // ── Invite not found ──────────────────────────────────────────────────────

  describe('invite not found', () => {
    it('redirects to /boards?error=invite-invalid when invite does not exist', async () => {
      mockAdminFrom.mockImplementation((table: string) => {
        if (table === 'board_invites') return mockInviteLookup(null, { message: 'not found' })
        return {}
      })
      const res = await GET(makeRequest(TEST_INVITE_ID))
      expect(res.status).toBe(307)
      expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('invite-invalid')
    })
  })

  // ── Email mismatch ────────────────────────────────────────────────────────

  describe('email mismatch', () => {
    it('redirects to /boards?error=invite-email-mismatch when user email differs', async () => {
      mockGetUser.mockResolvedValue({
        data: {
          user: { id: TEST_USER_ID, email: 'different@example.com' },
        },
        error: null,
      })
      const res = await GET(makeRequest(TEST_INVITE_ID))
      expect(res.status).toBe(307)
      expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('invite-email-mismatch')
    })

    it('comparison is case-insensitive', async () => {
      mockGetUser.mockResolvedValue({
        data: {
          user: { id: TEST_USER_ID, email: 'INVITEE@EXAMPLE.COM' },
        },
        error: null,
      })
      const res = await GET(makeRequest(TEST_INVITE_ID))
      // Should succeed (redirect to board), not mismatch
      expect(res.status).toBe(307)
      const location = new URL(res.headers.get('location')!)
      expect(location.pathname).toBe(`/board/${TEST_BOARD_ID}`)
    })
  })

  // ── Successful accept ─────────────────────────────────────────────────────

  describe('successful accept', () => {
    it('redirects to /board/{boardId}', async () => {
      const res = await GET(makeRequest(TEST_INVITE_ID))
      expect(res.status).toBe(307)
      const location = new URL(res.headers.get('location')!)
      expect(location.pathname).toBe(`/board/${TEST_BOARD_ID}`)
    })

    it('calls board_members upsert with correct data', async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null })
      mockAdminFrom.mockImplementation((table: string) => {
        if (table === 'board_invites') {
          return {
            ...mockInviteLookup(MOCK_INVITE),
            ...mockInviteDelete(),
          }
        }
        if (table === 'board_members') return { upsert: mockUpsert }
        return {}
      })

      await GET(makeRequest(TEST_INVITE_ID))
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          board_id: TEST_BOARD_ID,
          user_id: TEST_USER_ID,
          role: 'editor',
          can_use_agents: true,
        }),
        expect.objectContaining({ onConflict: 'board_id,user_id' })
      )
    })

    it('deletes the invite after accepting', async () => {
      const mockDeleteEq = vi.fn().mockResolvedValue({ error: null })
      const mockDeleteFn = vi.fn().mockReturnValue({ eq: mockDeleteEq })
      mockAdminFrom.mockImplementation((table: string) => {
        if (table === 'board_invites') {
          return {
            ...mockInviteLookup(MOCK_INVITE),
            delete: mockDeleteFn,
          }
        }
        if (table === 'board_members') return mockMemberUpsert()
        return {}
      })

      await GET(makeRequest(TEST_INVITE_ID))
      expect(mockDeleteFn).toHaveBeenCalled()
    })
  })

  // ── Invalid board_id in invite ─────────────────────────────────────────────

  describe('invalid board_id in invite', () => {
    it('redirects to /boards?error=invite-invalid when invite has non-UUID board_id', async () => {
      const badInvite = { ...MOCK_INVITE, board_id: '../admin' }
      mockAdminFrom.mockImplementation((table: string) => {
        if (table === 'board_invites') return mockInviteLookup(badInvite)
        return {}
      })
      const res = await GET(makeRequest(TEST_INVITE_ID))
      expect(res.status).toBe(307)
      expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('invite-invalid')
    })
  })

  // ── Auth edge cases ─────────────────────────────────────────────────────────

  describe('auth edge cases', () => {
    it('redirects to /login when getUser returns null data', async () => {
      mockGetUser.mockResolvedValue({ data: null, error: { message: 'session error' } })
      const res = await GET(makeRequest(TEST_INVITE_ID))
      expect(res.status).toBe(307)
      const location = new URL(res.headers.get('location')!)
      expect(location.pathname).toBe('/login')
    })
  })

  // ── Member upsert failure ─────────────────────────────────────────────────

  describe('member upsert failure', () => {
    it('redirects to /boards?error=invite-failed when upsert fails', async () => {
      mockAdminFrom.mockImplementation((table: string) => {
        if (table === 'board_invites') {
          return {
            ...mockInviteLookup(MOCK_INVITE),
            ...mockInviteDelete(),
          }
        }
        if (table === 'board_members') return mockMemberUpsert({ message: 'db error' })
        return {}
      })

      const res = await GET(makeRequest(TEST_INVITE_ID))
      expect(res.status).toBe(307)
      expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('invite-failed')
    })
  })

  // ── Delete failure ──────────────────────────────────────────────────────────

  describe('invite delete failure', () => {
    it('still redirects to board when delete fails (logs error)', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockAdminFrom.mockImplementation((table: string) => {
        if (table === 'board_invites') {
          return {
            ...mockInviteLookup(MOCK_INVITE),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: { message: 'delete failed' } }),
            }),
          }
        }
        if (table === 'board_members') return mockMemberUpsert()
        return {}
      })

      const res = await GET(makeRequest(TEST_INVITE_ID))
      expect(res.status).toBe(307)
      const location = new URL(res.headers.get('location')!)
      expect(location.pathname).toBe(`/board/${TEST_BOARD_ID}`)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to delete invite'),
        expect.anything()
      )
      consoleSpy.mockRestore()
    })
  })
})
