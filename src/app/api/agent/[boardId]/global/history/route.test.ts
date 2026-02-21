/**
 * Tests for GET /api/agent/[boardId]/global/history
 * Key paths: UUID validation, env check, auth, membership, no thread, success, OpenAI error.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  TEST_BOARD_ID,
  mockGetUser,
  mockMemberSingle,
  mockBoardSingle,
  mockMessagesList,
} = vi.hoisted(() => ({
  TEST_BOARD_ID: '11111111-1111-1111-1111-111111111111',
  mockGetUser: vi.fn(),
  mockMemberSingle: vi.fn(),
  mockBoardSingle: vi.fn(),
  mockMessagesList: vi.fn(),
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

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'boards') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: mockBoardSingle,
        }
      }
      return {}
    }),
  })),
}))

vi.mock('@/lib/agent/sse', () => ({
  getOpenAI: vi.fn(() => ({
    beta: {
      threads: {
        messages: { list: mockMessagesList },
      },
    },
  })),
}))

import { GET } from './route'

function makeParams(boardId = TEST_BOARD_ID) {
  return { params: Promise.resolve({ boardId }) }
}

describe('GET /api/agent/[boardId]/global/history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('OPENAI_API_KEY', 'test-key')

    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })
    mockMemberSingle.mockResolvedValue({
      data: { role: 'editor', can_use_agents: true },
      error: null,
    })
    mockBoardSingle.mockResolvedValue({
      data: { global_agent_thread_id: 'thread_abc' },
      error: null,
    })
    mockMessagesList.mockResolvedValue({
      data: [
        {
          id: 'msg_1',
          role: 'user',
          content: [{ type: 'text', text: { value: 'Hello' } }],
          created_at: 1704067200,
        },
        {
          id: 'msg_2',
          role: 'assistant',
          content: [{ type: 'text', text: { value: 'Hi there' } }],
          created_at: 1704067201,
        },
      ],
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns 400 for invalid board ID', async () => {
    const req = new NextRequest(`http://localhost/api/agent/invalid/global/history`)
    const res = await GET(req, makeParams('invalid'))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'Invalid board ID' })
  })

  it('returns 500 when OPENAI_API_KEY is not configured', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    const req = new NextRequest(`http://localhost/api/agent/${TEST_BOARD_ID}/global/history`)
    const res = await GET(req, makeParams())
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ error: 'OPENAI_API_KEY not configured' })
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

  it('returns 200 [] when board has no thread', async () => {
    mockBoardSingle.mockResolvedValueOnce({
      data: { global_agent_thread_id: null },
      error: null,
    })
    const req = new NextRequest(`http://localhost/api/agent/${TEST_BOARD_ID}/global/history`)
    const res = await GET(req, makeParams())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
    expect(mockMessagesList).not.toHaveBeenCalled()
  })

  it('returns 200 with messages on success', async () => {
    const req = new NextRequest(`http://localhost/api/agent/${TEST_BOARD_ID}/global/history`)
    const res = await GET(req, makeParams())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(2)
    expect(body[0]).toMatchObject({ id: 'msg_1', role: 'user', content: 'Hello' })
    expect(body[1]).toMatchObject({ id: 'msg_2', role: 'assistant', content: 'Hi there' })
    expect(mockMessagesList).toHaveBeenCalledWith('thread_abc', {
      limit: 50,
      order: 'asc',
    })
  })

  it('returns 200 [] when OpenAI throws', async () => {
    mockMessagesList.mockRejectedValueOnce(new Error('OpenAI API error'))
    const req = new NextRequest(`http://localhost/api/agent/${TEST_BOARD_ID}/global/history`)
    const res = await GET(req, makeParams())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })
})
