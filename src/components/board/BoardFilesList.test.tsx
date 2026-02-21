/**
 * Tests for BoardFilesList (file list in chat panel).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BoardFilesList } from './BoardFilesList'
import type { BoardObject, FileObject } from '@/types/board'

function makeFileObject(overrides: Partial<FileObject> = {}): FileObject {
  return {
    id: 'file-1',
    board_id: 'board-1',
    type: 'file',
    x: 100,
    y: 100,
    width: 200,
    height: 100,
    rotation: 0,
    text: '',
    color: '#333',
    font_size: 14,
    z_index: 0,
    parent_id: null,
    created_by: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    storage_path: 'board-1/file.pdf',
    file_name: 'document.pdf',
    mime_type: 'application/pdf',
    file_size: 1024,
    ...overrides,
  }
}

describe('BoardFilesList', () => {
  it('returns null when no file objects', () => {
    const objects = new Map<string, BoardObject>()
    const { container } = render(<BoardFilesList objects={objects} />)
    expect(container.firstChild).toBeNull()
  })

  it('returns null when objects have no file type', () => {
    const rect = { id: 'r1', type: 'rectangle' } as BoardObject
    const objects = new Map([['r1', rect]])
    const { container } = render(<BoardFilesList objects={objects} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders file list when file objects present', () => {
    const file = makeFileObject({ id: 'f1', file_name: 'doc.pdf', file_size: 2048 })
    const objects = new Map<string, BoardObject>([['f1', file]])
    render(<BoardFilesList objects={objects} />)
    expect(screen.getByText('Board Files (1)')).toBeInTheDocument()
    expect(screen.getByText('doc.pdf')).toBeInTheDocument()
    expect(screen.getByText('2.0 KB')).toBeInTheDocument()
  })

  it('formats file sizes: bytes, KB, MB', () => {
    const files = [
      makeFileObject({ id: 'f1', file_name: 'a.txt', file_size: 500 }),
      makeFileObject({ id: 'f2', file_name: 'b.txt', file_size: 1536 }),
      makeFileObject({ id: 'f3', file_name: 'c.txt', file_size: 2 * 1024 * 1024 }),
    ]
    const objects = new Map(files.map(f => [f.id, f]))
    render(<BoardFilesList objects={objects} />)
    expect(screen.getByText('500 B')).toBeInTheDocument()
    expect(screen.getByText('1.5 KB')).toBeInTheDocument()
    expect(screen.getByText('2.0 MB')).toBeInTheDocument()
  })

  it('shows mime icons: image, pdf, text, default', () => {
    const files = [
      makeFileObject({ id: 'f1', file_name: 'a.png', mime_type: 'image/png' }),
      makeFileObject({ id: 'f2', file_name: 'b.pdf', mime_type: 'application/pdf' }),
      makeFileObject({ id: 'f3', file_name: 'c.txt', mime_type: 'text/plain' }),
      makeFileObject({ id: 'f4', file_name: 'd.xyz', mime_type: 'application/octet-stream' }),
    ]
    const objects = new Map(files.map(f => [f.id, f]))
    render(<BoardFilesList objects={objects} />)
    expect(screen.getByText('a.png')).toBeInTheDocument()
    expect(screen.getByText('b.pdf')).toBeInTheDocument()
    expect(screen.getByText('c.txt')).toBeInTheDocument()
    expect(screen.getByText('d.xyz')).toBeInTheDocument()
  })

  it('calls onDelete when delete button clicked', async () => {
    const onDelete = vi.fn()
    const file = makeFileObject({ id: 'f1', file_name: 'doc.pdf', storage_path: 'path/to/file.pdf' })
    const objects = new Map<string, BoardObject>([['f1', file]])
    render(<BoardFilesList objects={objects} onDelete={onDelete} />)
    const btn = screen.getByRole('button', { name: /delete.*doc\.pdf/i })
    await userEvent.click(btn)
    expect(onDelete).toHaveBeenCalledWith('f1', 'path/to/file.pdf')
  })

  it('does not show delete button when onDelete not provided', () => {
    const file = makeFileObject({ id: 'f1', file_name: 'doc.pdf' })
    const objects = new Map<string, BoardObject>([['f1', file]])
    render(<BoardFilesList objects={objects} />)
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
  })

  it('uses file_name in delete aria-label', () => {
    const onDelete = vi.fn()
    const file = makeFileObject({ id: 'f1', file_name: 'my-doc.pdf', storage_path: 'x' })
    const objects = new Map<string, BoardObject>([['f1', file]])
    render(<BoardFilesList objects={objects} onDelete={onDelete} />)
    expect(screen.getByRole('button', { name: /delete my-doc\.pdf/i })).toBeInTheDocument()
  })
})
