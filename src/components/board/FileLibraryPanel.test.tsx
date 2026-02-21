/**
 * Tests for FileLibraryPanel component.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

import { FileLibraryPanel, FileRecord } from '@/components/board/FileLibraryPanel'

// ── Helpers ──────────────────────────────────────────────────────────

function makeFile(overrides?: Partial<FileRecord>): FileRecord {
  return {
    id: 'file-1',
    name: 'doc.pdf',
    file_type: 'application/pdf',
    size: 1024,
    storage_path: 'files/board-1/file-1.pdf',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

/** Build a mock fetch Response that resolves to the given JSON body. */
function mockJsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as unknown as Response
}

const DEFAULT_BOARD_ID = 'board-1'
const noop = () => {}

// ── Tests ─────────────────────────────────────────────────────────────

describe('FileLibraryPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // 1. returns null when isOpen is false
  it('returns null when isOpen is false', () => {
    const { container } = render(
      <FileLibraryPanel boardId={DEFAULT_BOARD_ID} isOpen={false} onClose={noop} />
    )
    expect(container.firstChild).toBeNull()
  })

  // 2. renders "File Library" header when open
  it('renders "File Library" header when open', async () => {
    vi.mocked(fetch).mockResolvedValue(mockJsonResponse({ files: [] }))

    await act(async () => {
      render(<FileLibraryPanel boardId={DEFAULT_BOARD_ID} isOpen={true} onClose={noop} />)
    })

    expect(screen.getByText('File Library')).toBeInTheDocument()
  })

  // 3. shows empty state "No files yet." when fetch returns empty array
  it('shows empty state "No files yet." when fetch returns empty array', async () => {
    vi.mocked(fetch).mockResolvedValue(mockJsonResponse({ files: [] }))

    await act(async () => {
      render(<FileLibraryPanel boardId={DEFAULT_BOARD_ID} isOpen={true} onClose={noop} />)
    })

    expect(screen.getByText('No files yet.')).toBeInTheDocument()
  })

  // 4. renders file list with name, size, and type badge
  it('renders file list with name, size, and type badge', async () => {
    const file = makeFile({ name: 'report.pdf', file_type: 'application/pdf', size: 2048 })
    vi.mocked(fetch).mockResolvedValue(mockJsonResponse({ files: [file] }))

    await act(async () => {
      render(<FileLibraryPanel boardId={DEFAULT_BOARD_ID} isOpen={true} onClose={noop} />)
    })

    expect(screen.getByText('report.pdf')).toBeInTheDocument()
    // 2048 bytes = 2.0 KB
    expect(screen.getByText('2.0 KB')).toBeInTheDocument()
    // PDF type badge
    expect(screen.getByText('PDF')).toBeInTheDocument()
  })

  // 5. calls fetch for files list on open
  it('calls fetch for files list on open', async () => {
    vi.mocked(fetch).mockResolvedValue(mockJsonResponse({ files: [] }))

    await act(async () => {
      render(<FileLibraryPanel boardId={DEFAULT_BOARD_ID} isOpen={true} onClose={noop} />)
    })

    expect(fetch).toHaveBeenCalledWith(`/api/files/${DEFAULT_BOARD_ID}`)
  })

  // 6. does not fetch when isOpen is false
  it('does not fetch when isOpen is false', () => {
    render(<FileLibraryPanel boardId={DEFAULT_BOARD_ID} isOpen={false} onClose={noop} />)
    expect(fetch).not.toHaveBeenCalled()
  })

  // 7. clicking Upload File button triggers file input click
  it('clicking Upload File button triggers file input click', async () => {
    vi.mocked(fetch).mockResolvedValue(mockJsonResponse({ files: [] }))

    await act(async () => {
      render(<FileLibraryPanel boardId={DEFAULT_BOARD_ID} isOpen={true} onClose={noop} />)
    })

    const fileInput = screen.getByLabelText('Upload file') as HTMLInputElement
    const clickSpy = vi.spyOn(fileInput, 'click')

    fireEvent.click(screen.getByText('Upload File'))

    expect(clickSpy).toHaveBeenCalledOnce()
  })

  // 8. successful upload prepends file to top of list
  it('successful upload prepends file to top of list', async () => {
    const existingFile = makeFile({ id: 'file-1', name: 'existing.pdf' })
    const newFile = makeFile({ id: 'file-2', name: 'new-upload.pdf' })

    // First call: file list fetch; second call: upload
    vi.mocked(fetch)
      .mockResolvedValueOnce(mockJsonResponse({ files: [existingFile] }))
      .mockResolvedValueOnce(mockJsonResponse({ ok: true, file: newFile }, true))

    await act(async () => {
      render(<FileLibraryPanel boardId={DEFAULT_BOARD_ID} isOpen={true} onClose={noop} />)
    })

    expect(screen.getByText('existing.pdf')).toBeInTheDocument()

    const fileInput = screen.getByLabelText('Upload file') as HTMLInputElement
    const mockFile = new File(['content'], 'new-upload.pdf', { type: 'application/pdf' })
    Object.defineProperty(fileInput, 'files', { value: [mockFile], configurable: true })

    await act(async () => {
      fireEvent.change(fileInput)
    })

    // new-upload.pdf should now appear — and be before existing.pdf in the DOM
    const items = screen.getAllByText(/\.pdf/)
    expect(items[0]).toHaveTextContent('new-upload.pdf')
    expect(items[1]).toHaveTextContent('existing.pdf')
  })

  // 9. server upload error shows error message
  it('server upload error shows error message', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(mockJsonResponse({ files: [] }))
      .mockResolvedValueOnce(mockJsonResponse({ error: 'File too large' }, false))

    await act(async () => {
      render(<FileLibraryPanel boardId={DEFAULT_BOARD_ID} isOpen={true} onClose={noop} />)
    })

    const fileInput = screen.getByLabelText('Upload file') as HTMLInputElement
    const mockFile = new File(['content'], 'big.pdf', { type: 'application/pdf' })
    Object.defineProperty(fileInput, 'files', { value: [mockFile], configurable: true })

    await act(async () => {
      fireEvent.change(fileInput)
    })

    expect(screen.getByText('File too large')).toBeInTheDocument()
  })

  // 10. network error during upload shows "Upload failed. Please try again."
  it('network error during upload shows "Upload failed. Please try again."', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(mockJsonResponse({ files: [] }))
      .mockRejectedValueOnce(new Error('Network failure'))

    await act(async () => {
      render(<FileLibraryPanel boardId={DEFAULT_BOARD_ID} isOpen={true} onClose={noop} />)
    })

    const fileInput = screen.getByLabelText('Upload file') as HTMLInputElement
    const mockFile = new File(['content'], 'test.pdf', { type: 'application/pdf' })
    Object.defineProperty(fileInput, 'files', { value: [mockFile], configurable: true })

    await act(async () => {
      fireEvent.change(fileInput)
    })

    expect(screen.getByText('Upload failed. Please try again.')).toBeInTheDocument()
  })

  it('sets correct drag data on drag start', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      mockJsonResponse({ files: [makeFile()] })
    ))

    await act(async () => {
      render(<FileLibraryPanel boardId={DEFAULT_BOARD_ID} isOpen={true} onClose={noop} />)
    })

    const listItem = await screen.findByTitle('Drag onto canvas to add as context')

    const dataTransfer: Record<string, string> = {}
    fireEvent.dragStart(listItem, {
      dataTransfer: {
        setData: (key: string, value: string) => { dataTransfer[key] = value },
        effectAllowed: '',
      },
    })

    const payload = JSON.parse(dataTransfer['application/collabboard-file'])
    expect(payload).toMatchObject({
      fileId: 'file-1',
      fileName: 'doc.pdf',
      mimeType: 'application/pdf',
    })
  })
})
