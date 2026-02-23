/**
 * Tests for FilePickerFlyout component.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { FilePickerFlyout } from './FilePickerFlyout'
import type { FileRecord } from './FileLibraryPanel'

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

function mockJsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as unknown as Response
}

describe('FilePickerFlyout', () => {
  const boardId = 'board-1'
  const onSelect = vi.fn()
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders upload button and file list area', async () => {
    vi.mocked(fetch).mockResolvedValue(mockJsonResponse({ files: [] }))

    await act(async () => {
      render(<FilePickerFlyout boardId={boardId} onSelect={onSelect} onClose={onClose} />)
    })

    expect(screen.getByRole('button', { name: /upload/i })).toBeInTheDocument()
    expect(screen.getByText('No files yet')).toBeInTheDocument()
  })

  it('fetches files from /api/files/{boardId} on mount', async () => {
    vi.mocked(fetch).mockResolvedValue(mockJsonResponse({ files: [] }))

    await act(async () => {
      render(<FilePickerFlyout boardId={boardId} onSelect={onSelect} onClose={onClose} />)
    })

    expect(fetch).toHaveBeenCalledWith(`/api/files/${boardId}`)
  })

  it('shows fetch error when API returns error', async () => {
    vi.mocked(fetch).mockResolvedValue(mockJsonResponse({ error: 'Not found' }))

    await act(async () => {
      render(<FilePickerFlyout boardId={boardId} onSelect={onSelect} onClose={onClose} />)
    })

    expect(screen.getByText('Not found')).toBeInTheDocument()
  })

  it('shows fetch error when fetch fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'))

    await act(async () => {
      render(<FilePickerFlyout boardId={boardId} onSelect={onSelect} onClose={onClose} />)
    })

    expect(screen.getByText('Failed to load files')).toBeInTheDocument()
  })

  it('renders file list with name, size (KB), and type badge', async () => {
    const file = makeFile({ name: 'report.pdf', file_type: 'application/pdf', size: 2048 })
    vi.mocked(fetch).mockResolvedValue(mockJsonResponse({ files: [file] }))

    await act(async () => {
      render(<FilePickerFlyout boardId={boardId} onSelect={onSelect} onClose={onClose} />)
    })

    expect(screen.getByText('report.pdf')).toBeInTheDocument()
    expect(screen.getByText('2.0 KB')).toBeInTheDocument()
  })

  it('formats file size as B when under 1024', async () => {
    const file = makeFile({ size: 500 })
    vi.mocked(fetch).mockResolvedValue(mockJsonResponse({ files: [file] }))

    await act(async () => {
      render(<FilePickerFlyout boardId={boardId} onSelect={onSelect} onClose={onClose} />)
    })

    expect(screen.getByText('500 B')).toBeInTheDocument()
  })

  it('formats file size as MB when over 1MB', async () => {
    const file = makeFile({ size: 2.5 * 1024 * 1024 })
    vi.mocked(fetch).mockResolvedValue(mockJsonResponse({ files: [file] }))

    await act(async () => {
      render(<FilePickerFlyout boardId={boardId} onSelect={onSelect} onClose={onClose} />)
    })

    expect(screen.getByText('2.5 MB')).toBeInTheDocument()
  })

  it('calls onSelect when file is clicked', async () => {
    const file = makeFile({ name: 'doc.pdf' })
    vi.mocked(fetch).mockResolvedValue(mockJsonResponse({ files: [file] }))

    await act(async () => {
      render(<FilePickerFlyout boardId={boardId} onSelect={onSelect} onClose={onClose} />)
    })

    expect(screen.getByText('doc.pdf')).toBeInTheDocument()

    fireEvent.click(screen.getByText('doc.pdf'))
    expect(onSelect).toHaveBeenCalledWith(file)
  })

  it('calls onClose when clicking outside panel', async () => {
    vi.mocked(fetch).mockResolvedValue(mockJsonResponse({ files: [] }))

    await act(async () => {
      render(
        <div>
          <div data-testid="outside">Outside</div>
          <FilePickerFlyout boardId={boardId} onSelect={onSelect} onClose={onClose} />
        </div>
      )
    })

    expect(screen.getByText('No files yet')).toBeInTheDocument()

    const outside = screen.getByTestId('outside')
    fireEvent.mouseDown(outside)
    expect(onClose).toHaveBeenCalled()
  })

  it('shows upload error when upload API returns error', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(mockJsonResponse({ files: [] }))
      .mockResolvedValueOnce(mockJsonResponse({ error: 'File too large' }, false))

    await act(async () => {
      render(<FilePickerFlyout boardId={boardId} onSelect={onSelect} onClose={onClose} />)
    })

    expect(screen.getByText('No files yet')).toBeInTheDocument()

    const fileInput = screen.getByLabelText('Upload file') as HTMLInputElement
    const mockFile = new File(['x'], 'test.pdf', { type: 'application/pdf' })
    Object.defineProperty(fileInput, 'files', { value: [mockFile], configurable: true })

    await act(async () => {
      fireEvent.change(fileInput)
    })

    expect(screen.getByText('File too large')).toBeInTheDocument()
  })

  it('adds file to list when upload succeeds', async () => {
    const existingFile = makeFile({ id: 'existing', name: 'old.pdf' })
    const newFile = makeFile({ id: 'new', name: 'new.pdf' })

    vi.mocked(fetch)
      .mockResolvedValueOnce(mockJsonResponse({ files: [existingFile] }))
      .mockResolvedValueOnce(mockJsonResponse({ file: newFile }))

    await act(async () => {
      render(<FilePickerFlyout boardId={boardId} onSelect={onSelect} onClose={onClose} />)
    })

    expect(screen.getByText('old.pdf')).toBeInTheDocument()

    const fileInput = screen.getByLabelText('Upload file') as HTMLInputElement
    const mockFile = new File(['x'], 'new.pdf', { type: 'application/pdf' })
    Object.defineProperty(fileInput, 'files', { value: [mockFile], configurable: true })

    await act(async () => {
      fireEvent.change(fileInput)
    })

    expect(screen.getByText('new.pdf')).toBeInTheDocument()
    expect(screen.getByText('old.pdf')).toBeInTheDocument()
  })
})
