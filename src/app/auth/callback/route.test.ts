/**
 * Tests for GET /auth/callback — OAuth code exchange and redirect.
 * Verifies success redirect, error redirect, and open redirect guard.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockExchangeCodeForSession } = vi.hoisted(() => ({
  mockExchangeCodeForSession: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { exchangeCodeForSession: mockExchangeCodeForSession },
  }),
}))

import { GET } from './route'

describe('GET /auth/callback', () => {
  beforeEach(() => {
    mockExchangeCodeForSession.mockReset()
  })

  function makeRequest(url: string): Request {
    return new Request(url)
  }

  it('redirects to origin/boards when code exchange succeeds and no next param', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null })
    const req = makeRequest('http://localhost/auth/callback?code=abc123')
    const res = await GET(req)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/boards')
  })

  it('redirects to origin/next when code exchange succeeds and next is valid', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null })
    const req = makeRequest('http://localhost/auth/callback?code=abc&next=/foo')
    const res = await GET(req)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/foo')
  })

  it('redirects to login?error=auth when code exchange fails', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: new Error('invalid code') })
    const req = makeRequest('http://localhost/auth/callback?code=bad')
    const res = await GET(req)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/login?error=auth')
  })

  it('redirects to login?error=auth when no code provided', async () => {
    const req = makeRequest('http://localhost/auth/callback')
    const res = await GET(req)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/login?error=auth')
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('open redirect guard: next=//evil.com uses /boards', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null })
    const req = makeRequest('http://localhost/auth/callback?code=ok&next=//evil.com')
    const res = await GET(req)
    expect(res.status).toBe(307)
    // protocol-relative next is rejected; redirectPath becomes /boards
    expect(res.headers.get('location')).toBe('http://localhost/boards')
  })
})
