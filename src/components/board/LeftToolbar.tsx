'use client'

import { BoardRole } from '@/types/sharing'
import { ShapeSelector, type ShapeAddHandler } from './ShapeSelector'
import { ColorPicker } from './ColorPicker'
import { FontSelector } from './FontSelector'
import type { FontStyle } from '@/types/board'

interface LeftToolbarProps {
  userRole: BoardRole
  onAddShape: ShapeAddHandler
  hasSelection: boolean
  hasStickyNoteSelected: boolean
  selectedColor?: string
  selectedFontFamily?: string
  selectedFontSize?: number
  selectedFontStyle?: FontStyle
  onColorChange: (color: string) => void
  onFontChange: (updates: { font_family?: string; font_size?: number; font_style?: FontStyle }) => void
  onDelete: () => void
  onDuplicate: () => void
  onGroup: () => void
  onUngroup: () => void
  canGroup: boolean
  canUngroup: boolean
}

export function LeftToolbar({
  userRole,
  onAddShape,
  hasSelection,
  hasStickyNoteSelected,
  selectedColor,
  selectedFontFamily,
  selectedFontSize,
  selectedFontStyle,
  onColorChange,
  onFontChange,
  onDelete,
  onDuplicate,
  onGroup,
  onUngroup,
  canGroup,
  canUngroup,
}: LeftToolbarProps) {
  const canEdit = userRole !== 'viewer'

  return (
    <aside className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-slate-200 bg-white py-3">
      {canEdit && (
        <>
          <div className="mb-2 w-full px-2">
            <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              Shapes
            </div>
          </div>
          <ShapeSelector onAddShape={onAddShape} compact />

          {hasStickyNoteSelected && (
            <>
              <div className="my-2 h-px w-8 bg-slate-200" />
              <FontSelector
                fontFamily={selectedFontFamily}
                fontSize={selectedFontSize}
                fontStyle={selectedFontStyle}
                onFontChange={onFontChange}
                compact
              />
            </>
          )}

          {hasSelection && (
            <>
              <div className="my-2 h-px w-8 bg-slate-200" />
              <ColorPicker
                selectedColor={selectedColor}
                onColorChange={onColorChange}
                compact
              />
              <div className="my-2 h-px w-8 bg-slate-200" />
              <button
                type="button"
                onClick={onDuplicate}
                className="flex h-10 w-10 flex-col items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100"
                title="Duplicate (Ctrl+D)"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h2m0 10a2 2 0 002 2h2a2 2 0 002-2v-2m0 10V6a2 2 0 00-2-2h-2a2 2 0 00-2 2v2" />
                </svg>
              </button>
              {canGroup && (
                <button
                  type="button"
                  onClick={onGroup}
                  className="flex h-10 w-10 flex-col items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100"
                  title="Group (Ctrl+G)"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              )}
              {canUngroup && (
                <button
                  type="button"
                  onClick={onUngroup}
                  className="flex h-10 w-10 flex-col items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100"
                  title="Ungroup (Ctrl+Shift+G)"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                onClick={onDelete}
                className="flex h-10 w-10 flex-col items-center justify-center rounded-lg text-red-600 transition hover:bg-red-50"
                title="Delete (Del)"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </>
          )}
        </>
      )}
    </aside>
  )
}
