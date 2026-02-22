/**
 * Tests for POST /api/invites
 * Critical paths: auth, validation, authorization, existing user add,
 * new user invite creation, email sending, fire-and-forget behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Hoisted mock fns ─────────────────────────────────────────────────────────

const {
  TEST_BOARD_ID,
  TEST_USER_ID,
  TEST_INVITE_ID,
  mockGetUser,
  mockAdminFrom,
  mockAdminRpc,
  mockEmailsSend,
} = vi.hoisted(() => ({
  TEST_BOARD_ID: '11111111-1111-1111-1111-111111111111',
  TEST_USER_ID: 'user-abc-123',
  TEST_INVITE_ID: 'invite-id-456',
  mockGetUser: vi.fn(),
  mockAdminFrom: vi.fn(),
  mockAdminRpc: vi.fn(),
  mockEmailsSend: vi.fn(),
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
    rpc: mockAdminRpc,
  })),
}))

vi.mock('@/lib/resend', () => ({
  resend: { emails: { send: mockEmailsSend } },
}))

// ── Env setup ────────────────────────────────────────────────────────────────

// Ensure app URL is available for email link construction
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'

// ── Import route AFTER mocks ─────────────────────────────────────────────────

import { POST } from './route'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/invites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeInvalidJsonRequest(): NextRequest {
  const req = new NextRequest('http://localhost/api/invites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  vi.spyOn(req, 'json').mockRejectedValue(new Error('invalid json'))
  return req
}

// Mock chain helpers for admin.from() calls
function mockMemberCheck(role: string | null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: role ? { role } : null,
      error: role ? null : { message: 'not found' },
    }),
  }
}

function setupRpcUserLookup(userId: string | null) {
  mockAdminRpc.mockResolvedValue({ data: userId, error: null })
}

function mockBoardLookup(name: string) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { name }, error: null }),
  }
}

function mockMemberUpsert(error: unknown = null) {
  return {
    upsert: vi.fn().mockResolvedValue({ error }),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
}

function mockInviteUpsert(data: unknown = { id: TEST_INVITE_ID }, error: unknown = null) {
  return {
    upsert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data, error }),
      }),
    }),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
}

const VALID_BODY = {
  boardId: TEST_BOARD_ID,
  email: 'invitee@example.com',
  role: 'editor',
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe('POST /api/invites', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Happy-path defaults
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: TEST_USER_ID,
          email: 'owner@example.com',
          user_metadata: { full_name: 'Board Owner' },
        },
      },
      error: null,
    })

    // Admin from() dispatches based on table
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'board_members') return mockMemberCheck('owner')
      if (table === 'boards') return mockBoardLookup('My Board')
      if (table === 'board_invites') return mockInviteUpsert()
      return {}
    })

    // Default: no existing user
    setupRpcUserLookup(null)

    // Email send succeeds
    mockEmailsSend.mockResolvedValue({ data: { id: 'email-123' }, error: null })
  })

  // ── Authentication ─────────────────────────────────────────────────────────

  describe('authentication', () => {
    it('returns 401 when getUser returns an auth error', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'Not authenticated' },
      })
      const res = await POST(makeRequest(VALID_BODY))
      expect(res.status).toBe(401)
      expect(await res.json()).toMatchObject({ error: 'Unauthorized' })
    })

    it('returns 401 when user is null', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null })
      const res = await POST(makeRequest(VALID_BODY))
      expect(res.status).toBe(401)
    })
  })

  // ── Validation ─────────────────────────────────────────────────────────────

  describe('request body validation', () => {
    it('returns 400 for invalid JSON', async () => {
      const res = await POST(makeInvalidJsonRequest())
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: 'Invalid JSON body' })
    })

    it('returns 400 when boardId is missing', async () => {
      const res = await POST(makeRequest({ email: 'a@b.com', role: 'editor' }))
      expect(res.status).toBe(400)
    })

    it('returns 400 when boardId is not a valid UUID', async () => {
      const res = await POST(makeRequest({ boardId: 'not-uuid', email: 'a@b.com', role: 'editor' }))
      expect(res.status).toBe(400)
    })

    it('returns 400 when email is missing', async () => {
      const res = await POST(makeRequest({ boardId: TEST_BOARD_ID, role: 'editor' }))
      expect(res.status).toBe(400)
    })

    it('returns 400 when email is invalid', async () => {
      const res = await POST(makeRequest({ boardId: TEST_BOARD_ID, email: 'not-email', role: 'editor' }))
      expect(res.status).toBe(400)
    })

    it('returns 400 when role is invalid', async () => {
      const res = await POST(makeRequest({ boardId: TEST_BOARD_ID, email: 'a@b.com', role: 'superadmin' }))
      expect(res.status).toBe(400)
    })

    it('returns 400 when role is owner', async () => {
      const res = await POST(makeRequest({ boardId: TEST_BOARD_ID, email: 'a@b.com', role: 'owner' }))
      expect(res.status).toBe(400)
    })
  })

  // ── Authorization ──────────────────────────────────────────────────────────

  describe('authorization', () => {
    it('returns 403 when caller has no membership', async () => {
      mockAdminFrom.mockImplementation((table: string) => {
        if (table === 'board_members') return mockMemberCheck(null)
        return {}
      })
      const res = await POST(makeRequest(VALID_BODY))
      expect(res.status).toBe(403)
    })

    it('returns 403 when caller is a viewer', async () => {
      mockAdminFrom.mockImplementation((table: string) => {
        if (table === 'board_members') return mockMemberCheck('viewer')
        return {}
      })
      const res = await POST(makeRequest(VALID_BODY))
      expect(res.status).toBe(403)
    })

    it('returns 403 when caller is an editor', async () => {
      mockAdminFrom.mockImplementation((table: string) => {
        if (table === 'board_members') return mockMemberCheck('editor')
        return {}
      })
      const res = await POST(makeRequest(VALID_BODY))
      expect(res.status).toBe(403)
    })

    it('allows owner to invite', async () => {
      const res = await POST(makeRequest(VALID_BODY))
      expect(res.status).toBe(201)
    })

    it('allows manager to invite', async () => {
      mockAdminFrom.mockImplementation((table: string) => {
        if (table === 'board_members') return mockMemberCheck('manager')
        if (table === 'boards') return mockBoardLookup('My Board')
        if (table === 'board_invites') return mockInviteUpsert()
        return {}
      })
      const res = await POST(makeRequest(VALID_BODY))
      expect(res.status).toBe(201)
    })
  })

  // ── Existing user (add directly) ──────────────────────────────────────────

  describe('existing user', () => {
    beforeEach(() => {
      setupRpcUserLookup('existing-user-id')
      mockAdminFrom.mockImplementation((table: string) => {
        if (table === 'board_members') {
          const chain = mockMemberCheck('owner')
          return { ...chain, upsert: vi.fn().mockResolvedValue({ error: null }) }
        }
        return {}
      })
    })

    it('returns 201 with outcome "added"', async () => {
      const res = await POST(makeRequest(VALID_BODY))
      expect(res.status).toBe(201)
      expect(await res.json()).toMatchObject({ outcome: 'added' })
    })

    it('does not send email when adding existing user', async () => {
      await POST(makeRequest(VALID_BODY))
      expect(mockEmailsSend).not.toHaveBeenCalled()
    })

    it('returns 500 when member upsert fails', async () => {
      mockAdminFrom.mockImplementation((table: string) => {
        if (table === 'board_members') {
          const chain = mockMemberCheck('owner')
          return { ...chain, upsert: vi.fn().mockResolvedValue({ error: { message: 'db error' } }) }
        }
        return {}
      })
      const res = await POST(makeRequest(VALID_BODY))
      expect(res.status).toBe(500)
    })
  })

  // ── New user (create invite + send email) ─────────────────────────────────

  describe('new user invite', () => {
    it('returns 201 with outcome "invited" and inviteId', async () => {
      const res = await POST(makeRequest(VALID_BODY))
      expect(res.status).toBe(201)
      const json = await res.json()
      expect(json.outcome).toBe('invited')
      expect(json.inviteId).toBe(TEST_INVITE_ID)
    })

    it('sends email via Resend', async () => {
      await POST(makeRequest(VALID_BODY))
      expect(mockEmailsSend).toHaveBeenCalledOnce()
      expect(mockEmailsSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'invitee@example.com',
          subject: expect.stringContaining('Board Owner'),
        })
      )
    })

    it('includes accept URL with invite id in email', async () => {
      await POST(makeRequest(VALID_BODY))
      const emailArgs = mockEmailsSend.mock.calls[0][0]
      expect(emailArgs.html).toContain(`/invite/accept?id=${TEST_INVITE_ID}`)
    })

    it('returns 500 when invite upsert fails', async () => {
      mockAdminFrom.mockImplementation((table: string) => {
        if (table === 'board_members') return mockMemberCheck('owner')
        if (table === 'board_invites') return mockInviteUpsert(null, { message: 'db error' })
        return {}
      })
      const res = await POST(makeRequest(VALID_BODY))
      expect(res.status).toBe(500)
    })

    it('does not send email when invite upsert fails', async () => {
      mockAdminFrom.mockImplementation((table: string) => {
        if (table === 'board_members') return mockMemberCheck('owner')
        if (table === 'board_invites') return mockInviteUpsert(null, { message: 'db error' })
        return {}
      })
      await POST(makeRequest(VALID_BODY))
      expect(mockEmailsSend).not.toHaveBeenCalled()
    })
  })

  // ── Fire-and-forget email ─────────────────────────────────────────────────

  describe('email fire-and-forget', () => {
    it('returns 201 even when email send fails', async () => {
      mockEmailsSend.mockRejectedValueOnce(new Error('Resend API error'))
      const res = await POST(makeRequest(VALID_BODY))
      expect(res.status).toBe(201)
      const json = await res.json()
      expect(json.outcome).toBe('invited')
      expect(json.emailWarning).toBeDefined()
    })
  })

  // ── Email normalization ───────────────────────────────────────────────────

  describe('email normalization', () => {
    it('normalizes email to lowercase', async () => {
      await POST(makeRequest({ ...VALID_BODY, email: 'USER@EXAMPLE.COM' }))
      // The RPC should receive the lowercased email
      expect(mockAdminRpc).toHaveBeenCalledWith('lookup_user_by_email', { p_email: 'user@example.com' })
    })

    it('trims whitespace from email before validation', async () => {
      const res = await POST(makeRequest({ ...VALID_BODY, email: '  invitee@example.com  ' }))
      expect(res.status).toBe(201)
    })
  })
})
