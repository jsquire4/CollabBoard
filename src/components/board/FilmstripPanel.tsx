'use client'

import type { BoardObject } from '@/types/board'

export interface FilmstripPanelProps {
  deckId: string
  boardId: string
  slideFrames: BoardObject[]
  onReorder: (from: number, to: number) => void
  isOpen: boolean
  onClose: () => void
}

export function FilmstripPanel({ slideFrames, isOpen, onClose }: FilmstripPanelProps) {
  if (!isOpen) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-parchment rounded-xl shadow-xl border border-parchment-border flex flex-col"
      style={{ width: 480 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-parchment-border">
        <span className="text-sm font-semibold text-charcoal">Slide Deck</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {}}
            className="text-xs px-3 py-1.5 rounded-md bg-navy/10 text-navy font-medium hover:bg-navy/15 transition-colors"
          >
            Export
          </button>
          <button
            onClick={onClose}
            className="text-charcoal/60 hover:text-charcoal/60 transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Filmstrip */}
      <div className="flex gap-3 px-4 py-3 overflow-x-auto">
        {slideFrames.length === 0 ? (
          <p className="text-xs text-charcoal/40 py-4 w-full text-center">
            No slides yet. Mark a frame as a slide to add it here.
          </p>
        ) : (
          slideFrames.map((frame, i) => (
            <div
              key={frame.id}
              className="flex-shrink-0 flex flex-col items-center gap-1"
            >
              {/* Drag handle */}
              <span
                draggable
                className="cursor-grab text-charcoal/40 text-xs select-none"
                title="Drag to reorder (Phase 2)"
              >
                ⠿
              </span>
              {/* Thumbnail placeholder */}
              <div className="w-20 h-14 rounded bg-parchment-dark border border-parchment-border flex items-center justify-center">
                <span className="text-charcoal/40 text-xs font-bold">{(frame.slide_index ?? i) + 1}</span>
              </div>
              <span className="text-xs text-charcoal/60 truncate max-w-20">
                {frame.title ?? `Slide ${(frame.slide_index ?? i) + 1}`}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
