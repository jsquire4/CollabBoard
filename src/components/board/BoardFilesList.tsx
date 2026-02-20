'use client'

import { useMemo } from 'react'
import type { BoardObject, FileObject } from '@/types/board'

interface BoardFilesListProps {
  objects: Map<string, BoardObject>
  onDelete?: (objectId: string, storagePath: string) => void
}

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function mimeIcon(mime: string | null | undefined): string {
  if (!mime) return '📄'
  if (mime.startsWith('image/')) return '🖼️'
  if (mime === 'application/pdf') return '📑'
  if (mime.startsWith('text/')) return '📝'
  return '📄'
}

export function BoardFilesList({ objects, onDelete }: BoardFilesListProps) {
  const files = useMemo(() => {
    const result: FileObject[] = []
    for (const obj of objects.values()) {
      if (obj.type === 'file' && obj.storage_path && obj.file_name && obj.mime_type) {
        result.push(obj as FileObject)
      }
    }
    return result.sort((a, b) => a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0)
  }, [objects])

  if (files.length === 0) return null

  return (
    <div className="border-t border-slate-200 dark:border-slate-600">
      <div className="px-4 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Board Files ({files.length})
        </h3>
      </div>
      <div className="max-h-40 overflow-y-auto px-2 pb-2">
        {files.map(file => (
          <div
            key={file.id}
            className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            <span className="text-base">{mimeIcon(file.mime_type)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-slate-700 dark:text-slate-200">
                {file.file_name || 'Unnamed file'}
              </p>
              <p className="text-xs text-slate-400">
                {formatFileSize(file.file_size)}
              </p>
            </div>
            {onDelete && file.storage_path && (
              <button
                onClick={() => onDelete(file.id, file.storage_path!)}
                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                aria-label={`Delete ${file.file_name}`}
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
