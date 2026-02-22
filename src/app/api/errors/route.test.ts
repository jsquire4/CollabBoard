/**
 * Tests for POST /api/errors — void error reporting stub.
 */
import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

describe('POST /api/errors', () => {
  it('returns 200 for any payload', async () => {
    const req = new NextRequest('http://localhost/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'TypeError: something exploded', stack: '...' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('returns 200 for empty body', async () => {
    const req = new NextRequest('http://localhost/api/errors', {
      method: 'POST',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
  })
})
