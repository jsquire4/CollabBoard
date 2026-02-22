/**
 * Tests for useFileUpload — file upload validation, API call, delete.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFileUpload } from './useFileUpload'

const mockToastError = vi.fn()
const mockToastSuccess = vi.fn()

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}))

function makeFile(overrides: Partial<{ name: string; size: number; type: string }> = {}): File {
  return {
    name: 'test.png',
    size: 1024,
    type: 'image/png',
    ...overrides,
  } as File
}

function createMockSupabase(removeResult: { error: unknown } = { error: null }) {
  return {
    storage: {
      from: vi.fn(() => ({
        remove: vi.fn().mockResolvedValue(removeResult),
      })),
    },
  } as unknown as Parameters<typeof useFileUpload>[0]['supabase']
}

describe('useFileUpload', () => {
  const BOARD_ID = '11111111-1111-1111-1111-111111111111'
  const mockAddObject = vi.fn()
  const mockRemoveObject = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockAddObject.mockReturnValue({ id: 'obj-1', type: 'file' })
    vi.stubGlobal('fetch', vi.fn())
  })

  it('returns isUploading, uploadFile, handleDrop, deleteFile', () => {
    const { result } = renderHook(() =>
      useFileUpload({
        boardId: BOARD_ID,
        canEdit: true,
        supabase: createMockSupabase(),
        addObject: mockAddObject,
        removeObject: mockRemoveObject,
      })
    )
    expect(result.current.isUploading).toBe(false)
    expect(typeof result.current.uploadFile).toBe('function')
    expect(typeof result.current.handleDrop).toBe('function')
    expect(typeof result.current.deleteFile).toBe('function')
  })

  it('rejects upload when canEdit is false', async () => {
    const { result } = renderHook(() =>
      useFileUpload({
        boardId: BOARD_ID,
        canEdit: false,
        supabase: createMockSupabase(),
        addObject: mockAddObject,
      })
    )

    await act(async () => {
      const obj = await result.current.uploadFile(makeFile())
      expect(obj).toBeNull()
    })

    expect(mockToastError).toHaveBeenCalledWith('You do not have permission to upload files')
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('rejects file exceeding MAX_FILE_SIZE', async () => {
    const { result } = renderHook(() =>
      useFileUpload({
        boardId: BOARD_ID,
        canEdit: true,
        supabase: createMockSupabase(),
        addObject: mockAddObject,
      })
    )

    const largeFile = makeFile({ size: 51 * 1024 * 1024 })

    await act(async () => {
      const obj = await result.current.uploadFile(largeFile)
      expect(obj).toBeNull()
    })

    expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining('File too large'))
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('rejects unsupported file type', async () => {
    const { result } = renderHook(() =>
      useFileUpload({
        boardId: BOARD_ID,
        canEdit: true,
        supabase: createMockSupabase(),
        addObject: mockAddObject,
      })
    )

    const svgFile = makeFile({ type: 'image/svg+xml', name: 'test.svg' })

    await act(async () => {
      const obj = await result.current.uploadFile(svgFile)
      expect(obj).toBeNull()
    })

    expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining('Unsupported file type'))
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('uploads successfully and adds object', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        file: {
          id: 'file-1',
          storage_path: 'path/to/file',
          name: 'test.png',
          file_type: 'image/png',
          size: 1024,
        },
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() =>
      useFileUpload({
        boardId: BOARD_ID,
        canEdit: true,
        supabase: createMockSupabase(),
        addObject: mockAddObject,
      })
    )

    await act(async () => {
      const obj = await result.current.uploadFile(makeFile())
      expect(obj).not.toBeNull()
    })

    expect(mockFetch).toHaveBeenCalledWith('/api/files/upload', expect.objectContaining({
      method: 'POST',
      body: expect.any(FormData),
    }))
    expect(mockAddObject).toHaveBeenCalledWith('file', 0, 0, expect.objectContaining({
      file_id: 'file-1',
      storage_path: 'path/to/file',
      file_name: 'test.png',
    }))
    expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining('File uploaded'))
  })

  it('shows toast and returns null when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() =>
      useFileUpload({
        boardId: BOARD_ID,
        canEdit: true,
        supabase: createMockSupabase(),
        addObject: mockAddObject,
      })
    )

    await act(async () => {
      const obj = await result.current.uploadFile(makeFile())
      expect(obj).toBeNull()
    })

    expect(mockToastError).toHaveBeenCalledWith('Upload failed')
    consoleSpy.mockRestore()
  })

  it('shows toast and returns null when API returns error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Storage quota exceeded' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() =>
      useFileUpload({
        boardId: BOARD_ID,
        canEdit: true,
        supabase: createMockSupabase(),
        addObject: mockAddObject,
      })
    )

    await act(async () => {
      const obj = await result.current.uploadFile(makeFile())
      expect(obj).toBeNull()
    })

    expect(mockToastError).toHaveBeenCalledWith('Storage quota exceeded')
    expect(mockAddObject).not.toHaveBeenCalled()
  })

  it('handleDrop calls uploadFile for each file', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        file: { id: 'f1', storage_path: 'p', name: 'a.png', file_type: 'image/png', size: 100 },
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() =>
      useFileUpload({
        boardId: BOARD_ID,
        canEdit: true,
        supabase: createMockSupabase(),
        addObject: mockAddObject,
      })
    )

    const files = [makeFile({ name: 'a.png' }), makeFile({ name: 'b.png' })]
    await act(async () => {
      await result.current.handleDrop(files)
    })

    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('deleteFile removes from storage and calls removeObject', async () => {
    const { result } = renderHook(() =>
      useFileUpload({
        boardId: BOARD_ID,
        canEdit: true,
        supabase: createMockSupabase(),
        addObject: mockAddObject,
        removeObject: mockRemoveObject,
      })
    )

    await act(async () => {
      await result.current.deleteFile('obj-1', 'path/to/file')
    })

    expect(mockRemoveObject).toHaveBeenCalledWith('obj-1')
    expect(mockToastSuccess).toHaveBeenCalledWith('File deleted')
  })

  it('deleteFile shows toast when storage remove fails', async () => {
    const supabase = createMockSupabase({ error: { message: 'storage error' } })

    const { result } = renderHook(() =>
      useFileUpload({
        boardId: BOARD_ID,
        canEdit: true,
        supabase,
        addObject: mockAddObject,
        removeObject: mockRemoveObject,
      })
    )

    await act(async () => {
      await result.current.deleteFile('obj-1', 'path/to/file')
    })

    expect(mockToastError).toHaveBeenCalledWith('Failed to delete file')
    expect(mockRemoveObject).not.toHaveBeenCalled()
  })
})
