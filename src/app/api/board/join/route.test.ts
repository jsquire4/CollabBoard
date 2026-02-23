/**
 * Tests for POST /api/board/join — join via share link with IP blocking.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockGetUser,
  mockRpc,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    rpc: mockRpc,
  }),
}))

import { POST } from './route'

const BOARD_ID = '22222222-2222-2222-2222-222222222222'

function makeRequest(body: Record<string, unknown>, headers?: Record<string, string>): NextRequest {
  const req = new NextRequest('http://localhost/api/board/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  return req
}

describe('POST /api/board/join', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
  })

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const res = await POST(makeRequest({ token: 'valid-token' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when token is missing', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 400 when body is invalid JSON', async () => {
    const req = new NextRequest('http://localhost/api/board/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not valid json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid JSON body')
  })

  it('returns 404 when get_board_id_for_share_token returns error', async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === 'get_board_id_for_share_token') return Promise.resolve({ data: null, error: { message: 'token invalid' } })
      return Promise.resolve({ data: null, error: null })
    })

    const res = await POST(makeRequest({ token: 'bad-token' }, { 'x-real-ip': '1.2.3.4' }))
    expect(res.status).toBe(404)
  })

  it('returns 500 when is_ip_blocked_for_board fails', async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === 'get_board_id_for_share_token') return Promise.resolve({ data: BOARD_ID, error: null })
      if (name === 'is_ip_blocked_for_board') return Promise.resolve({ data: null, error: { message: 'DB error' } })
      return Promise.resolve({ data: null, error: null })
    })

    const res = await POST(makeRequest({ token: 'valid-token' }, { 'x-real-ip': '1.2.3.4' }))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to verify access')
  })

  it('returns 500 when join_board_via_link returns generic error', async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === 'get_board_id_for_share_token') return Promise.resolve({ data: BOARD_ID, error: null })
      if (name === 'is_ip_blocked_for_board') return Promise.resolve({ data: false, error: null })
      if (name === 'join_board_via_link') return Promise.resolve({ data: null, error: { message: 'Database connection failed' } })
      return Promise.resolve({ data: null, error: null })
    })

    const res = await POST(makeRequest({ token: 'valid-token' }, { 'x-real-ip': '1.2.3.4' }))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to join board')
  })

  it('returns 500 when join_board_via_link returns null boardId', async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === 'get_board_id_for_share_token') return Promise.resolve({ data: BOARD_ID, error: null })
      if (name === 'is_ip_blocked_for_board') return Promise.resolve({ data: false, error: null })
      if (name === 'join_board_via_link') return Promise.resolve({ data: null, error: null })
      return Promise.resolve({ data: null, error: null })
    })

    const res = await POST(makeRequest({ token: 'valid-token' }, { 'x-real-ip': '1.2.3.4' }))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to join board')
  })

  it('returns 404 when link is invalid', async () => {
    mockRpc.mockImplementation((name: string, args?: Record<string, unknown>) => {
      if (name === 'get_board_id_for_share_token') return Promise.resolve({ data: null, error: null })
      return Promise.resolve({ data: null, error: null })
    })

    const res = await POST(makeRequest({ token: 'bad-token' }, { 'x-real-ip': '1.2.3.4' }))
    expect(res.status).toBe(404)
  })

  it('returns 403 when IP is blocked', async () => {
    mockRpc.mockImplementation((name: string, args?: Record<string, unknown>) => {
      if (name === 'get_board_id_for_share_token') return Promise.resolve({ data: BOARD_ID, error: null })
      if (name === 'is_ip_blocked_for_board') return Promise.resolve({ data: true, error: null })
      return Promise.resolve({ data: null, error: null })
    })

    const res = await POST(makeRequest({ token: 'valid-token' }, { 'x-real-ip': '1.2.3.4' }))
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toContain('removed')
  })

  it('joins successfully when IP is not blocked', async () => {
    mockRpc.mockImplementation((name: string, args?: Record<string, unknown>) => {
      if (name === 'get_board_id_for_share_token') return Promise.resolve({ data: BOARD_ID, error: null })
      if (name === 'is_ip_blocked_for_board') return Promise.resolve({ data: false, error: null })
      if (name === 'join_board_via_link') return Promise.resolve({ data: BOARD_ID, error: null })
      return Promise.resolve({ data: null, error: null })
    })

    const res = await POST(makeRequest({ token: 'valid-token' }, { 'x-real-ip': '1.2.3.4' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.boardId).toBe(BOARD_ID)
    expect(mockRpc).toHaveBeenCalledWith('join_board_via_link', {
      p_token: 'valid-token',
      p_client_ip: '1.2.3.4',
    })
  })

  it('joins successfully when no IP header (passes null)', async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === 'join_board_via_link') return Promise.resolve({ data: BOARD_ID, error: null })
      return Promise.resolve({ data: null, error: null })
    })

    const res = await POST(makeRequest({ token: 'valid-token' }))
    expect(res.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledWith('join_board_via_link', {
      p_token: 'valid-token',
      p_client_ip: null,
    })
  })
})
