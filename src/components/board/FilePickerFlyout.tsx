'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { mimeTypeLabel, mimeTypeBadgeClass } from '@/lib/agent/mimeClassification'
import type { FileRecord } from './FileLibraryPanel'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface FilePickerFlyoutProps {
  boardId: string
  onSelect: (file: FileRecord) => void
  onClose: () => void
}

export function FilePickerFlyout({ boardId, onSelect, onClose }: FilePickerFlyoutProps) {
  const [files, setFiles] = useState<FileRecord[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Load files on mount
  useEffect(() => {
    let cancelled = false
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
  }, [boardId])

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

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
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [boardId])

  return (
    <div
      ref={panelRef}
      className="fixed z-[200] rounded-xl border p-2 shadow-lg ring-1 ring-black/10 border-parchment-border bg-parchment dark:border-white/10 dark:bg-[#1E293B] dark:ring-white/10 animate-[flyout-in]"
      style={{ left: 68, top: 200, width: 220, maxHeight: 360 }}
    >
      {/* Upload button */}
      <div className="mb-2">
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
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg border-2 border-dashed border-indigo-200 text-xs text-indigo-500 hover:border-indigo-400 hover:bg-indigo-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? (
            <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          )}
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
        {uploadError && (
          <p className="text-[10px] text-red-500 mt-1 text-center">{uploadError}</p>
        )}
      </div>

      {/* File list */}
      <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
        {fetchError && (
          <p className="text-[10px] text-red-500 text-center mb-2">{fetchError}</p>
        )}
        {files.length === 0 ? (
          <p className="text-[10px] text-slate-400 text-center py-4">No files yet</p>
        ) : (
          <ul className="space-y-1">
            {files.map(file => (
              <li key={file.id}>
                <button
                  type="button"
                  onClick={() => onSelect(file)}
                  className="w-full flex items-center gap-2 p-1.5 rounded-lg hover:bg-parchment-dark dark:hover:bg-white/10 transition-colors text-left"
                >
                  <span className={`shrink-0 text-[9px] font-bold px-1 py-0.5 rounded ${mimeTypeBadgeClass(file.file_type)}`}>
                    {mimeTypeLabel(file.file_type)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-medium text-charcoal dark:text-parchment truncate">{file.name}</p>
                    <p className="text-[9px] text-charcoal/50 dark:text-parchment/50">{formatBytes(file.size)}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
