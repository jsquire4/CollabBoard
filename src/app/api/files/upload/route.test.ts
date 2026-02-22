/**
 * Tests for POST /api/files/upload
 * Critical paths: auth, form validation, MIME allowlist, size limit,
 * membership check, storage upload, DB insert, cleanup on error.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Hoisted constants + mock fns ─────────────────────────────────────────────

const {
  TEST_BOARD_ID,
  TEST_FILE_ID,
  TEST_USER_ID,
  mockGetUser,
  mockMemberSingle,
  mockStorageUpload,
  mockStorageRemove,
  mockFilesInsert,
} = vi.hoisted(() => ({
  TEST_BOARD_ID: '11111111-1111-1111-1111-111111111111',
  TEST_FILE_ID: 'fixed-uuid-1234-1234-1234-123456789012',
  TEST_USER_ID: 'user-abc-123',
  mockGetUser: vi.fn(),
  mockMemberSingle: vi.fn(),
  mockStorageUpload: vi.fn(),
  mockStorageRemove: vi.fn(),
  mockFilesInsert: vi.fn(),
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
  createAdminClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: mockStorageUpload,
        remove: mockStorageRemove,
      })),
    },
    from: vi.fn((table: string) => {
      if (table === 'files') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: mockFilesInsert,
            })),
          })),
        }
      }
      return {}
    }),
  })),
}))

vi.mock('uuid', () => ({ v4: vi.fn().mockReturnValue('fixed-uuid-1234-1234-1234-123456789012') }))

// ── Import route AFTER mocks ──────────────────────────────────────────────────

import { POST } from './route'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Creates a bare NextRequest and stubs its formData() method to return the
 * provided map. This avoids the jsdom/fetch hang that occurs when NextRequest
 * tries to parse a real multipart body in the test environment.
 */
function makeRequest(fields: { file?: File; boardId?: string } | 'throw' = {}): NextRequest {
  const req = new NextRequest('http://localhost/api/files/upload', { method: 'POST' })

  if (fields === 'throw') {
    vi.spyOn(req, 'formData').mockRejectedValue(new Error('invalid multipart'))
  } else {
    const fd = new FormData()
    if (fields.file) fd.append('file', fields.file)
    if (fields.boardId !== undefined) fd.append('boardId', fields.boardId)
    vi.spyOn(req, 'formData').mockResolvedValue(fd)
  }

  return req
}

function makeFile(opts: { name?: string; type?: string; size?: number } = {}): File {
  const name = opts.name ?? 'test.png'
  const type = opts.type ?? 'image/png'
  const size = opts.size ?? 1024
  return new File([new Uint8Array(size)], name, { type })
}

const MOCK_FILE_RECORD = {
  id: TEST_FILE_ID,
  name: 'test.png',
  file_type: 'image/png',
  size: 1024,
  storage_path: `files/${TEST_BOARD_ID}/${TEST_FILE_ID}.png`,
  owner_type: 'board',
  owner_id: TEST_BOARD_ID,
  created_by: TEST_USER_ID,
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('POST /api/files/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Happy-path defaults
    mockGetUser.mockResolvedValue({
      data: { user: { id: TEST_USER_ID, email: 'user@example.com' } },
      error: null,
    })
    mockMemberSingle.mockResolvedValue({
      data: { role: 'editor' },
      error: null,
    })
    mockStorageUpload.mockResolvedValue({ error: null })
    mockStorageRemove.mockResolvedValue({ error: null })
    mockFilesInsert.mockResolvedValue({ data: MOCK_FILE_RECORD, error: null })
  })

  // ── 1. Auth ───────────────────────────────────────────────────────────────

  describe('authentication', () => {
    it('returns 401 when getUser returns an auth error', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'Not authenticated' },
      })
      const res = await POST(makeRequest({ file: makeFile(), boardId: TEST_BOARD_ID }))
      expect(res.status).toBe(401)
      expect(await res.json()).toMatchObject({ error: 'Unauthorized' })
    })

    it('returns 401 when user is null with no error', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null })
      const res = await POST(makeRequest({ file: makeFile(), boardId: TEST_BOARD_ID }))
      expect(res.status).toBe(401)
      expect(await res.json()).toMatchObject({ error: 'Unauthorized' })
    })
  })

  // ── 2. Form data parsing ──────────────────────────────────────────────────

  describe('form data parsing', () => {
    it('returns 400 when formData() throws', async () => {
      const res = await POST(makeRequest('throw'))
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: 'Invalid form data' })
    })
  })

  // ── 3. Missing file ───────────────────────────────────────────────────────

  describe('missing required fields', () => {
    it('returns 400 when no file is provided', async () => {
      const res = await POST(makeRequest({ boardId: TEST_BOARD_ID }))
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: 'file is required' })
    })

    // ── 4. Missing boardId ────────────────────────────────────────────────────

    it('returns 400 when no boardId is provided', async () => {
      const res = await POST(makeRequest({ file: makeFile() }))
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: 'boardId is required' })
    })
  })

  // ── 5. Invalid boardId ────────────────────────────────────────────────────

  describe('boardId validation', () => {
    it('returns 400 when boardId is not a UUID', async () => {
      const res = await POST(makeRequest({ file: makeFile(), boardId: 'not-a-uuid' }))
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: 'Invalid board ID' })
    })

    it('returns 400 when boardId is a non-UUID numeric string', async () => {
      const res = await POST(makeRequest({ file: makeFile(), boardId: '12345' }))
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: 'Invalid board ID' })
    })

    it('returns 400 when boardId is a plain word string', async () => {
      const res = await POST(makeRequest({ file: makeFile(), boardId: 'my-board' }))
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: 'Invalid board ID' })
    })
  })

  // ── 6. MIME allowlist ─────────────────────────────────────────────────────

  describe('MIME type validation', () => {
    const rejectedTypes = [
      'image/svg+xml',
      'application/javascript',
      'text/html',
      'application/zip',
      'application/octet-stream',
      'video/mp4',
      'audio/mpeg',
    ]

    it.each(rejectedTypes)('returns 400 for disallowed MIME type: %s', async (mimeType) => {
      const file = makeFile({ type: mimeType })
      const res = await POST(makeRequest({ file, boardId: TEST_BOARD_ID }))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/File type not allowed/)
    })

    // ── 7. Allowed MIME types ───────────────────────────────────────────────

    const allowedTypes: Array<[string, string]> = [
      ['image/jpeg', 'jpg'],
      ['image/png', 'png'],
      ['image/gif', 'gif'],
      ['image/webp', 'webp'],
      ['application/pdf', 'pdf'],
      ['text/plain', 'txt'],
      ['text/markdown', 'md'],
      ['text/csv', 'csv'],
    ]

    it.each(allowedTypes)('accepts allowed MIME type %s and uses ext .%s', async (mimeType, ext) => {
      const file = makeFile({ name: `file.${ext}`, type: mimeType })
      const res = await POST(makeRequest({ file, boardId: TEST_BOARD_ID }))
      expect(res.status).toBe(201)
      // Verify the storage path uses the correct extension
      const uploadCall = mockStorageUpload.mock.calls[0]
      const storagePath: string = uploadCall[0]
      expect(storagePath).toMatch(new RegExp(`\\.${ext}$`))
    })
  })

  // ── 8. Size limit ─────────────────────────────────────────────────────────

  describe('file size validation', () => {
    it('returns 400 when file exceeds 50MB', async () => {
      const FIFTY_ONE_MB = 51 * 1024 * 1024
      const file = makeFile({ size: FIFTY_ONE_MB })
      const res = await POST(makeRequest({ file, boardId: TEST_BOARD_ID }))
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: 'File too large. Maximum size is 50MB.' })
    })

    it('accepts a file exactly at the 50MB boundary', async () => {
      const FIFTY_MB = 50 * 1024 * 1024
      const file = makeFile({ size: FIFTY_MB })
      const res = await POST(makeRequest({ file, boardId: TEST_BOARD_ID }))
      expect(res.status).toBe(201)
    })
  })

  // ── 9. Membership check ───────────────────────────────────────────────────

  describe('membership authorization', () => {
    it('returns 403 for viewer role', async () => {
      mockMemberSingle.mockResolvedValueOnce({ data: { role: 'viewer' }, error: null })
      const res = await POST(makeRequest({ file: makeFile(), boardId: TEST_BOARD_ID }))
      expect(res.status).toBe(403)
      expect(await res.json()).toMatchObject({ error: 'Forbidden' })
    })

    it('returns 403 when there is no membership record', async () => {
      mockMemberSingle.mockResolvedValueOnce({ data: null, error: null })
      const res = await POST(makeRequest({ file: makeFile(), boardId: TEST_BOARD_ID }))
      expect(res.status).toBe(403)
      expect(await res.json()).toMatchObject({ error: 'Forbidden' })
    })

    it('allows owner role to upload', async () => {
      mockMemberSingle.mockResolvedValueOnce({ data: { role: 'owner' }, error: null })
      const res = await POST(makeRequest({ file: makeFile(), boardId: TEST_BOARD_ID }))
      expect(res.status).toBe(201)
    })

    it('allows editor role to upload', async () => {
      mockMemberSingle.mockResolvedValueOnce({ data: { role: 'editor' }, error: null })
      const res = await POST(makeRequest({ file: makeFile(), boardId: TEST_BOARD_ID }))
      expect(res.status).toBe(201)
    })
  })

  // ── 10. Storage upload error ──────────────────────────────────────────────

  describe('storage errors', () => {
    it('returns 500 when storage upload fails', async () => {
      mockStorageUpload.mockResolvedValueOnce({ error: { message: 'Storage quota exceeded' } })
      const res = await POST(makeRequest({ file: makeFile(), boardId: TEST_BOARD_ID }))
      expect(res.status).toBe(500)
      expect(await res.json()).toMatchObject({ error: 'Upload failed' })
    })

    it('does not attempt DB insert when storage upload fails', async () => {
      mockStorageUpload.mockResolvedValueOnce({ error: { message: 'bucket not found' } })
      await POST(makeRequest({ file: makeFile(), boardId: TEST_BOARD_ID }))
      expect(mockFilesInsert).not.toHaveBeenCalled()
    })
  })

  // ── 11. DB insert error + storage cleanup ────────────────────────────────

  describe('database errors', () => {
    it('returns 500 when DB insert fails', async () => {
      mockFilesInsert.mockResolvedValueOnce({ data: null, error: { message: 'insert failed' } })
      const res = await POST(makeRequest({ file: makeFile(), boardId: TEST_BOARD_ID }))
      expect(res.status).toBe(500)
      expect(await res.json()).toMatchObject({ error: 'Failed to save file record' })
    })

    it('removes the uploaded storage file when DB insert fails', async () => {
      mockFilesInsert.mockResolvedValueOnce({ data: null, error: { message: 'insert failed' } })
      await POST(makeRequest({ file: makeFile(), boardId: TEST_BOARD_ID }))
      expect(mockStorageRemove).toHaveBeenCalledOnce()
      const removedPaths: string[] = mockStorageRemove.mock.calls[0][0]
      expect(removedPaths).toHaveLength(1)
      expect(removedPaths[0]).toMatch(
        new RegExp(`^files/${TEST_BOARD_ID}/${TEST_FILE_ID}\\.`)
      )
    })
  })

  // ── 12. Happy path ────────────────────────────────────────────────────────

  describe('happy path', () => {
    it('returns 201 with the file record on successful upload', async () => {
      const res = await POST(makeRequest({ file: makeFile(), boardId: TEST_BOARD_ID }))
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body).toHaveProperty('file')
      expect(body.file).toMatchObject({
        id: TEST_FILE_ID,
        name: 'test.png',
        file_type: 'image/png',
      })
    })

    it('uses the correct storagePath format: files/{boardId}/{fileId}.{ext}', async () => {
      const res = await POST(
        makeRequest({ file: makeFile({ name: 'photo.jpg', type: 'image/jpeg' }), boardId: TEST_BOARD_ID })
      )
      expect(res.status).toBe(201)
      const uploadCall = mockStorageUpload.mock.calls[0]
      const storagePath: string = uploadCall[0]
      expect(storagePath).toBe(`files/${TEST_BOARD_ID}/${TEST_FILE_ID}.jpg`)
    })

    it('passes upsert:false and the correct contentType to storage', async () => {
      await POST(makeRequest({ file: makeFile({ type: 'application/pdf' }), boardId: TEST_BOARD_ID }))
      const uploadOpts = mockStorageUpload.mock.calls[0][2]
      expect(uploadOpts).toMatchObject({ contentType: 'application/pdf', upsert: false })
    })

    it('does not call storage remove when upload and DB insert both succeed', async () => {
      await POST(makeRequest({ file: makeFile(), boardId: TEST_BOARD_ID }))
      expect(mockStorageRemove).not.toHaveBeenCalled()
    })
  })

  // ── 13. Filename sanitization ─────────────────────────────────────────────

  describe('filename sanitization', () => {
    /**
     * Captures the payload passed to admin.from('files').insert() by
     * temporarily overriding createAdminClient for a single call.
     */
    async function captureInsertPayload(file: File): Promise<Record<string, unknown>> {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      let captured: Record<string, unknown> | null = null

      vi.mocked(createAdminClient).mockImplementationOnce(() => ({
        storage: {
          from: vi.fn(() => ({
            upload: mockStorageUpload,
            remove: mockStorageRemove,
          })),
        },
        from: vi.fn((table: string) => {
          if (table === 'files') {
            return {
              insert: vi.fn((payload: Record<string, unknown>) => {
                captured = payload
                return {
                  select: vi.fn(() => ({
                    single: vi.fn().mockResolvedValue({ data: MOCK_FILE_RECORD, error: null }),
                  })),
                }
              }),
            }
          }
          return {}
        }),
      }) as any)

      await POST(makeRequest({ file, boardId: TEST_BOARD_ID }))
      if (!captured) throw new Error('insert was never called')
      return captured
    }

    it('replaces forward slashes in the filename with underscores', async () => {
      const payload = await captureInsertPayload(
        makeFile({ name: 'path/to/file.png', type: 'image/png' })
      )
      expect((payload as { name: string }).name).not.toContain('/')
      expect((payload as { name: string }).name).toContain('_')
    })

    it('replaces backslashes in the filename with underscores', async () => {
      const payload = await captureInsertPayload(
        makeFile({ name: 'folder\\file.png', type: 'image/png' })
      )
      expect((payload as { name: string }).name).not.toContain('\\')
    })

    it('truncates filename to 255 characters', async () => {
      const longName = 'a'.repeat(300) + '.png'
      const payload = await captureInsertPayload(makeFile({ name: longName, type: 'image/png' }))
      expect((payload as { name: string }).name).toHaveLength(255)
    })

    it('replaces slashes and truncates to 255 chars in a single insert', async () => {
      // 'ab/' repeated 100 times = 300 chars, contains slashes
      const slashyLong = 'ab/'.repeat(100) + '.png'
      const payload = await captureInsertPayload(makeFile({ name: slashyLong, type: 'image/png' }))
      const savedName = (payload as { name: string }).name
      expect(savedName).not.toContain('/')
      expect(savedName.length).toBeLessThanOrEqual(255)
    })
  })
})
