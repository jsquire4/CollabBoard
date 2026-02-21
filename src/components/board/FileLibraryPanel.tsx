'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

export interface FileRecord {
  id: string
  name: string
  file_type: string
  size: number
  storage_path: string
  created_at: string
}

export interface FileLibraryPanelProps {
  boardId: string
  isOpen: boolean
  onClose: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function typeLabel(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'IMG'
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType === 'text/csv') return 'CSV'
  if (mimeType === 'text/markdown') return 'MD'
  if (mimeType === 'text/plain') return 'TXT'
  return 'FILE'
}

function typeBg(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'bg-emerald-100 text-emerald-700'
  if (mimeType === 'application/pdf') return 'bg-red-100 text-red-700'
  if (mimeType === 'text/csv') return 'bg-amber-100 text-amber-700'
  return 'bg-slate-100 text-slate-600'
}

export function FileLibraryPanel({ boardId, isOpen, onClose }: FileLibraryPanelProps) {
  const [files, setFiles] = useState<FileRecord[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load files on open
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setFetchError(null)

    fetch(`/api/files/${boardId}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        if (data.files) setFiles(data.files)
        else if (data.error) setFetchError(data.error)
      })
      .catch(() => {
        if (!cancelled) setFetchError('Failed to load files')
      })

    return () => { cancelled = true }
  }, [boardId, isOpen])

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadError(null)
    setUploading(true)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('boardId', boardId)

    try {
      const res = await fetch('/api/files/upload', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) {
        setUploadError(data.error ?? 'Upload failed')
        return
      }

      if (data.file) {
        setFiles(prev => [data.file, ...prev])
      }
    } catch {
      setUploadError('Upload failed. Please try again.')
    } finally {
      setUploading(false)
      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [boardId])

  const handleDragStart = useCallback((file: FileRecord) => (e: React.DragEvent) => {
    e.dataTransfer.setData(
      'application/collabboard-file',
      JSON.stringify({ fileId: file.id, fileName: file.name, mimeType: file.file_type }),
    )
    e.dataTransfer.effectAllowed = 'copy'
  }, [])

  if (!isOpen) return null

  return (
    <div className="fixed right-4 top-16 z-50 w-72 rounded-xl bg-white shadow-xl border border-slate-200 flex flex-col overflow-hidden" style={{ maxHeight: '70vh' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50 shrink-0">
        <span className="text-sm font-semibold text-slate-700">File Library</span>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="Close"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Upload button */}
      <div className="px-4 pt-3 shrink-0">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf,.txt,.md,.csv"
          onChange={handleFileSelected}
          aria-label="Upload file"
        />
        <button
          onClick={handleUploadClick}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed border-indigo-200 text-sm text-indigo-500 hover:border-indigo-400 hover:bg-indigo-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? (
            <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          )}
          {uploading ? 'Uploading…' : 'Upload File'}
        </button>
        {uploadError && (
          <p className="text-xs text-red-500 mt-1 text-center">{uploadError}</p>
        )}
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto p-4 pt-3">
        {fetchError && (
          <p className="text-xs text-red-500 text-center mb-2">{fetchError}</p>
        )}
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4">
            <svg className="w-10 h-10 text-slate-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-slate-400 text-center">No files yet.</p>
            <p className="text-xs text-slate-300 text-center mt-1">Upload files to use with your board agents.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {files.map(file => (
              <li
                key={file.id}
                draggable
                onDragStart={handleDragStart(file)}
                className="flex items-center gap-3 p-2 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50 cursor-grab active:cursor-grabbing transition-colors"
                title="Drag onto canvas to add as context"
              >
                <span className={`shrink-0 text-xs font-bold px-1.5 py-0.5 rounded ${typeBg(file.file_type)}`}>
                  {typeLabel(file.file_type)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-700 truncate">{file.name}</p>
                  <p className="text-xs text-slate-400">{formatBytes(file.size)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
