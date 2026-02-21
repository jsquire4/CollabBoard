/**
 * Tests for proxy (Next.js auth middleware).
 * Verifies redirect logic for unauthenticated users and exempt paths.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}))

import { proxy } from './proxy'

describe('proxy', () => {
  beforeEach(() => {
    mockGetUser.mockReset()
  })

  function makeRequest(pathname: string): NextRequest {
    return new NextRequest(`http://localhost${pathname}`, {
      headers: { 'x-forwarded-host': 'localhost' },
    })
  }

  it('returns next when user is authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const req = makeRequest('/boards')
    const res = await proxy(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })

  it('returns next for unauthenticated user on / (landing)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const req = makeRequest('/')
    const res = await proxy(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })

  it('returns next for unauthenticated user on /login', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const req = makeRequest('/login')
    const res = await proxy(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })

  it('returns next for unauthenticated user on /auth/callback', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const req = makeRequest('/auth/callback')
    const res = await proxy(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })

  it('returns next for unauthenticated user on /board/join/xyz', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const req = makeRequest('/board/join/abc-token-123')
    const res = await proxy(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })

  it('redirects to /login for unauthenticated user on /boards', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const req = makeRequest('/boards')
    const res = await proxy(req)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toMatch(/\/login$/)
  })

  it('redirects to /login for unauthenticated user on /board/123', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const req = makeRequest('/board/abc-123')
    const res = await proxy(req)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toMatch(/\/login$/)
  })
})
