'use client'

import { useRef } from 'react'
import type { BoardObject } from '@/types/board'

export interface FilmstripPanelProps {
  isOpen: boolean
  onClose: () => void
  boardId: string
  frames: BoardObject[]
  currentFrameId?: string | null
  onSelectSlide: (frameId: string) => void
  onReorder: (newOrder: string[]) => void
  onExport: () => void
  thumbnails: Record<string, string>
}

export function FilmstripPanel({
  isOpen,
  onClose,
  frames,
  currentFrameId,
  onSelectSlide,
  onReorder,
  onExport,
  thumbnails,
}: FilmstripPanelProps) {
  const dragIndexRef = useRef<number | null>(null)

  if (!isOpen) return null

  const handleDragStart = (index: number) => {
    dragIndexRef.current = index
  }

  const handleDrop = (dropIndex: number) => {
    if (dragIndexRef.current === null || dragIndexRef.current === dropIndex) {
      dragIndexRef.current = null
      return
    }

    const newOrder = frames.map(f => f.id)
    const [removed] = newOrder.splice(dragIndexRef.current, 1)
    newOrder.splice(dropIndex, 0, removed)
    dragIndexRef.current = null
    onReorder(newOrder)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-white rounded-xl shadow-xl border border-slate-200 flex flex-col"
      style={{ width: 520 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-700">Slide Deck</span>
          {frames.length > 0 && (
            <span className="text-xs text-slate-400">{frames.length} slide{frames.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onExport}
            aria-label="Export slides"
            className="text-xs px-3 py-1.5 rounded-md bg-indigo-50 text-indigo-600 font-medium hover:bg-indigo-100 transition-colors"
          >
            Export
          </button>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Close filmstrip"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Filmstrip */}
      <div className="flex gap-3 px-4 py-3 overflow-x-auto">
        {frames.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 w-full text-center">
            No slides yet. Mark a frame as a slide to add it here.
          </p>
        ) : (
          frames.map((frame, i) => {
            const isActive = frame.id === currentFrameId
            const thumbnail = thumbnails[frame.id]

            return (
              <div
                key={frame.id}
                data-slide-id={frame.id}
                data-testid={`slide-${frame.id}`}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(i)}
                onClick={() => onSelectSlide(frame.id)}
                className={`flex-shrink-0 flex flex-col items-center gap-1 cursor-pointer select-none ${
                  isActive ? 'ring-2 ring-indigo-500 rounded-md p-0.5' : ''
                }`}
              >
                {/* Thumbnail */}
                <div className="w-20 h-14 rounded bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden">
                  {thumbnail ? (
                    <img
                      src={thumbnail}
                      alt={frame.title ?? `Slide ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-slate-400 text-xs font-bold">{i + 1}</span>
                  )}
                </div>
                <span className="text-xs text-slate-500 truncate max-w-20">
                  {frame.title ?? `Slide ${i + 1}`}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
