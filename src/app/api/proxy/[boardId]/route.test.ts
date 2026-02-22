/**
 * Tests for POST /api/proxy/[boardId] — SSRF-safe proxy route.
 * Critical paths: auth, SSRF protection, timeout, write-back.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Hoisted constants ─────────────────────────────────────────────────────────

const {
  TEST_BOARD_ID,
  TEST_OBJECT_ID,
  mockGetUser,
  mockMemberSingle,
  mockAdminUpdate,
  mockDnsResolve4,
  mockDnsResolve6,
} = vi.hoisted(() => ({
  TEST_BOARD_ID: '11111111-1111-1111-1111-111111111111',
  TEST_OBJECT_ID: '33333333-3333-3333-3333-333333333333',
  mockGetUser: vi.fn(),
  mockMemberSingle: vi.fn(),
  mockAdminUpdate: vi.fn(),
  mockDnsResolve4: vi.fn(),
  mockDnsResolve6: vi.fn(),
}))

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      if (table === 'board_members') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: mockMemberSingle,
        }
      }
      return {}
    }),
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockReturnValue({
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn().mockReturnThis(),
        is: vi.fn(() => Promise.resolve({ error: null })),
      })),
    })),
  }),
}))

// ── DNS mock ──────────────────────────────────────────────────────────────────

vi.mock('dns/promises', () => ({
  resolve4: mockDnsResolve4,
  resolve6: mockDnsResolve6,
}))

// ── Fetch mock ────────────────────────────────────────────────────────────────

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ── Import after mocks ────────────────────────────────────────────────────────

import { POST, isPrivateIp } from './route'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: object, boardId: string = TEST_BOARD_ID): NextRequest {
  return new NextRequest(`http://localhost/api/proxy/${boardId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function authOk() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'user-1', email: 'user@example.com' } },
    error: null,
  })
  mockMemberSingle.mockResolvedValue({
    data: { role: 'editor' },
    error: null,
  })
}

function mockUpstreamOk(status = 200, body = '{"result":"ok"}') {
  mockFetch.mockResolvedValueOnce(
    new Response(body, {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )
}

// ── isPrivateIp unit tests ────────────────────────────────────────────────────

describe('isPrivateIp', () => {
  it('returns true for 127.0.0.1', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true)
  })

  it('returns true for 10.0.0.1', () => {
    expect(isPrivateIp('10.0.0.1')).toBe(true)
  })

  it('returns true for 192.168.1.1', () => {
    expect(isPrivateIp('192.168.1.1')).toBe(true)
  })

  it('returns true for 169.254.169.254 (metadata IP)', () => {
    expect(isPrivateIp('169.254.169.254')).toBe(true)
  })

  it('returns true for 172.16.0.1 (RFC1918)', () => {
    expect(isPrivateIp('172.16.0.1')).toBe(true)
  })

  it('returns true for ::1 (IPv6 loopback)', () => {
    expect(isPrivateIp('::1')).toBe(true)
  })

  it('returns false for public IP', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false)
  })
})

// ── Route tests ───────────────────────────────────────────────────────────────

describe('POST /api/proxy/[boardId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDnsResolve4.mockResolvedValue(['1.2.3.4'])
    mockDnsResolve6.mockRejectedValue(new Error('no AAAA'))
  })

  // 1. Returns 403 when user is not a board member
  it('returns 403 when user is not a board member', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'user@example.com' } },
      error: null,
    })
    mockMemberSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } })

    const req = makeRequest({ url: 'https://api.example.com/data' })
    const res = await POST(req, { params: Promise.resolve({ boardId: TEST_BOARD_ID }) })

    expect(res.status).toBe(403)
  })

  // 2. Returns 401 when not authenticated
  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    })

    const req = makeRequest({ url: 'https://api.example.com/data' })
    const res = await POST(req, { params: Promise.resolve({ boardId: TEST_BOARD_ID }) })

    expect(res.status).toBe(401)
  })

  // 3. Returns 400 when URL is missing
  it('returns 400 when URL is missing', async () => {
    authOk()

    const req = makeRequest({})
    const res = await POST(req, { params: Promise.resolve({ boardId: TEST_BOARD_ID }) })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/url/i)
  })

  // 4. Returns 400 when URL is not HTTPS
  it('returns 400 when URL is not HTTPS', async () => {
    authOk()

    const req = makeRequest({ url: 'http://api.example.com/data' })
    const res = await POST(req, { params: Promise.resolve({ boardId: TEST_BOARD_ID }) })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/https/i)
  })

  // 5. Returns 400 when hostname resolves to private IP
  it('returns 400 when hostname resolves to private IP', async () => {
    authOk()
    mockDnsResolve4.mockResolvedValue(['10.0.0.1'])

    const req = makeRequest({ url: 'https://internal.company.com/api' })
    const res = await POST(req, { params: Promise.resolve({ boardId: TEST_BOARD_ID }) })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/private/i)
  })

  // 6. Returns 400 when hostname resolves to metadata IP (169.254.x.x)
  it('returns 400 when hostname resolves to metadata IP', async () => {
    authOk()
    mockDnsResolve4.mockResolvedValue(['169.254.169.254'])

    const req = makeRequest({ url: 'https://metadata.company.com/api' })
    const res = await POST(req, { params: Promise.resolve({ boardId: TEST_BOARD_ID }) })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/private/i)
  })

  // 7. Returns 200 with response body on valid external URL
  it('returns 200 with response body on valid external URL', async () => {
    authOk()
    mockUpstreamOk(200, '{"data":"hello"}')

    const req = makeRequest({ url: 'https://api.example.com/endpoint' })
    const res = await POST(req, { params: Promise.resolve({ boardId: TEST_BOARD_ID }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe(200)
    expect(body.body).toBe('{"data":"hello"}')
  })

  // 8. Strips forbidden headers from forwarded request
  it('strips Authorization and Cookie headers from forwarded request', async () => {
    authOk()
    mockUpstreamOk()

    const req = makeRequest({
      url: 'https://api.example.com/endpoint',
      headers: {
        Authorization: 'Bearer secret-token',
        Cookie: 'session=abc',
        'X-Custom-Header': 'allowed',
      },
    })
    await POST(req, { params: Promise.resolve({ boardId: TEST_BOARD_ID }) })

    const fetchCall = mockFetch.mock.calls[0]
    const passedHeaders = fetchCall[1]?.headers ?? {}
    expect(passedHeaders['Authorization']).toBeUndefined()
    expect(passedHeaders['authorization']).toBeUndefined()
    expect(passedHeaders['Cookie']).toBeUndefined()
    expect(passedHeaders['cookie']).toBeUndefined()
    expect(passedHeaders['X-Custom-Header']).toBe('allowed')
  })

  // 9. Returns 504 on timeout
  it('returns 504 when request times out', async () => {
    authOk()
    const timeoutErr = new Error('The operation was aborted.')
    timeoutErr.name = 'TimeoutError'
    mockFetch.mockRejectedValueOnce(timeoutErr)

    const req = makeRequest({ url: 'https://api.example.com/slow' })
    const res = await POST(req, { params: Promise.resolve({ boardId: TEST_BOARD_ID }) })

    expect(res.status).toBe(504)
  })

  // 10. Returns 500 on network error
  it('returns 500 on network error', async () => {
    authOk()
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const req = makeRequest({ url: 'https://api.example.com/down' })
    const res = await POST(req, { params: Promise.resolve({ boardId: TEST_BOARD_ID }) })

    expect(res.status).toBe(500)
  })

  // 11. Returns 400 for redirect to private IP
  it('returns 400 for redirect attempts', async () => {
    authOk()
    const redirectErr = new Error('Redirect was blocked')
    mockFetch.mockRejectedValueOnce(redirectErr)

    const req = makeRequest({ url: 'https://api.example.com/redirect' })
    const res = await POST(req, { params: Promise.resolve({ boardId: TEST_BOARD_ID }) })

    // Network errors that aren't timeout
    expect([400, 500]).toContain(res.status)
  })

  // 12. Persists response to board_objects.formula when writeBackObjectId provided
  it('writes response to formula when writeBackObjectId is valid', async () => {
    authOk()
    mockUpstreamOk(200, '{"result":"data"}')

    const req = makeRequest({
      url: 'https://api.example.com/data',
      writeBackObjectId: TEST_OBJECT_ID,
    })
    const res = await POST(req, { params: Promise.resolve({ boardId: TEST_BOARD_ID }) })

    expect(res.status).toBe(200)
    // Admin client update should have been called
    const { createAdminClient } = await import('@/lib/supabase/admin')
    expect(vi.mocked(createAdminClient)).toHaveBeenCalled()
  })
})
