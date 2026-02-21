/**
 * Tests for GET /api/files/[boardId] — list files for a board.
 * Critical paths: UUID validation, auth, membership, admin fetch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  TEST_BOARD_ID,
  TEST_USER_ID,
  mockGetUser,
  mockMemberSingle,
  mockAdminSelect,
} = vi.hoisted(() => ({
  TEST_BOARD_ID: '11111111-1111-1111-1111-111111111111',
  TEST_USER_ID: 'user-abc-123',
  mockGetUser: vi.fn(),
  mockMemberSingle: vi.fn(),
  mockAdminSelect: vi.fn(),
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
      if (table === 'files') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: mockAdminSelect,
        }
      }
      return {}
    }),
  })),
}))

import { GET } from './route'

function makeParams(boardId = TEST_BOARD_ID) {
  return { params: Promise.resolve({ boardId }) }
}

const MOCK_FILES = [
  {
    id: 'file-1',
    name: 'doc.pdf',
    file_type: 'application/pdf',
    size: 1024,
    storage_path: 'path/1',
    created_at: '2024-01-01T00:00:00Z',
  },
]

describe('GET /api/files/[boardId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({
      data: { user: { id: TEST_USER_ID } },
      error: null,
    })
    mockMemberSingle.mockResolvedValue({
      data: { role: 'editor' },
      error: null,
    })
    mockAdminSelect.mockResolvedValue({ data: MOCK_FILES, error: null })
  })

  it('returns 400 for invalid board ID', async () => {
    const req = new NextRequest('http://localhost/api/files/invalid')
    const res = await GET(req, makeParams('invalid'))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'Invalid board ID' })
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Not authenticated' },
    })
    const req = new NextRequest(`http://localhost/api/files/${TEST_BOARD_ID}`)
    const res = await GET(req, makeParams())
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'Unauthorized' })
  })

  it('returns 403 when not a board member', async () => {
    mockMemberSingle.mockResolvedValueOnce({ data: null, error: null })
    const req = new NextRequest(`http://localhost/api/files/${TEST_BOARD_ID}`)
    const res = await GET(req, makeParams())
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'Forbidden' })
  })

  it('returns 200 with files on success', async () => {
    const req = new NextRequest(`http://localhost/api/files/${TEST_BOARD_ID}`)
    const res = await GET(req, makeParams())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('files')
    expect(body.files).toEqual(MOCK_FILES)
  })

  it('returns 500 when admin fetch fails', async () => {
    mockAdminSelect.mockResolvedValueOnce({
      data: null,
      error: { message: 'DB error' },
    })
    const req = new NextRequest(`http://localhost/api/files/${TEST_BOARD_ID}`)
    const res = await GET(req, makeParams())
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ error: 'Failed to load files' })
  })
})
