'use client'

import { useState, useCallback, useRef, type DragEvent, type ReactNode } from 'react'

interface FileDropZoneProps {
  onDrop: (files: FileList) => void
  disabled?: boolean
  children: ReactNode
}

export function FileDropZone({ onDrop, disabled, children }: FileDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCountRef = useRef(0)

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (disabled) return
    dragCountRef.current++
    if (dragCountRef.current === 1) {
      setIsDragOver(true)
    }
  }, [disabled])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCountRef.current = Math.max(0, dragCountRef.current - 1)
    if (dragCountRef.current === 0) {
      setIsDragOver(false)
    }
  }, [])

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCountRef.current = 0
    setIsDragOver(false)

    if (disabled) return
    if (e.dataTransfer.files.length > 0) {
      onDrop(e.dataTransfer.files)
    }
  }, [disabled, onDrop])

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="relative flex-1 flex flex-col"
    >
      {children}
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20">
          <div className="rounded-lg bg-white px-6 py-4 shadow-lg dark:bg-slate-800">
            <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
              Drop files to upload
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
