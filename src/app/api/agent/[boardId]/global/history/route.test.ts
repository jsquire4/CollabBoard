/**
 * Tests for GET /api/agent/[boardId]/global/history
 * The global agent is stateless — history always returns [].
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  TEST_BOARD_ID,
  mockGetUser,
  mockMemberSingle,
} = vi.hoisted(() => ({
  TEST_BOARD_ID: '11111111-1111-1111-1111-111111111111',
  mockGetUser: vi.fn(),
  mockMemberSingle: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      if (table === 'board_members') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: mockMemberSingle,
        }
      }
      return {}
    }),
  }),
}))

import { GET } from './route'

function makeParams(boardId = TEST_BOARD_ID) {
  return { params: Promise.resolve({ boardId }) }
}

describe('GET /api/agent/[boardId]/global/history', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })
    mockMemberSingle.mockResolvedValue({
      data: { role: 'editor', can_use_agents: true },
      error: null,
    })
  })

  it('returns 400 for invalid board ID', async () => {
    const req = new NextRequest(`http://localhost/api/agent/invalid/global/history`)
    const res = await GET(req, makeParams('invalid'))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'Invalid board ID' })
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Not authenticated' },
    })
    const req = new NextRequest(`http://localhost/api/agent/${TEST_BOARD_ID}/global/history`)
    const res = await GET(req, makeParams())
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'Unauthorized' })
  })

  it('returns 403 when not a member', async () => {
    mockMemberSingle.mockResolvedValueOnce({ data: null, error: null })
    const req = new NextRequest(`http://localhost/api/agent/${TEST_BOARD_ID}/global/history`)
    const res = await GET(req, makeParams())
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'Forbidden' })
  })

  it('returns 403 when can_use_agents is false', async () => {
    mockMemberSingle.mockResolvedValueOnce({
      data: { role: 'editor', can_use_agents: false },
      error: null,
    })
    const req = new NextRequest(`http://localhost/api/agent/${TEST_BOARD_ID}/global/history`)
    const res = await GET(req, makeParams())
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'Forbidden' })
  })

  it('returns 200 [] for authorized members', async () => {
    const req = new NextRequest(`http://localhost/api/agent/${TEST_BOARD_ID}/global/history`)
    const res = await GET(req, makeParams())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })
})
