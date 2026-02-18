'use client'

import { BoardRole } from '@/types/sharing'
import { ColorPicker } from './ColorPicker'
import { FontSelector } from './FontSelector'
import { ShapeIcon } from './ShapeIcon'
import type { BoardObjectType, FontStyle } from '@/types/board'

const ALL_SHAPES: { type: BoardObjectType; label: string }[] = [
  { type: 'sticky_note', label: 'Note' },
  { type: 'rectangle', label: 'Rect' },
  { type: 'circle', label: 'Circle' },
  { type: 'triangle', label: 'Triangle' },
  { type: 'chevron', label: 'Hexagon' },
  { type: 'parallelogram', label: 'Parallel' },
  { type: 'frame', label: 'Frame' },
]

const LINE_TYPES: { type: BoardObjectType; label: string }[] = [
  { type: 'line', label: 'Line' },
  { type: 'arrow', label: 'Arrow' },
]

interface LeftToolbarProps {
  userRole: BoardRole
  activeTool: BoardObjectType | null
  onToolSelect: (type: BoardObjectType) => void
  hasSelection: boolean
  isEditingText: boolean
  selectedColor?: string
  selectedFontFamily?: string
  selectedFontSize?: number
  selectedFontStyle?: FontStyle
  selectedTextAlign?: string
  selectedTextVerticalAlign?: string
  selectedTextColor?: string
  onColorChange: (color: string) => void
  onFontChange: (updates: { font_family?: string; font_size?: number; font_style?: FontStyle }) => void
  onTextStyleChange: (updates: { text_align?: string; text_vertical_align?: string; text_color?: string }) => void
  onDelete: () => void
  onDuplicate: () => void
  onGroup: () => void
  onUngroup: () => void
  canGroup: boolean
  canUngroup: boolean
  selectedStrokeColor?: string | null
  onStrokeColorChange: (color: string | null) => void
}

export function LeftToolbar({
  userRole,
  activeTool,
  onToolSelect,
  hasSelection,
  isEditingText,
  selectedColor,
  selectedFontFamily,
  selectedFontSize,
  selectedFontStyle,
  selectedTextAlign,
  selectedTextVerticalAlign,
  selectedTextColor,
  onColorChange,
  onFontChange,
  onTextStyleChange,
  onDelete,
  onDuplicate,
  onGroup,
  onUngroup,
  canGroup,
  canUngroup,
  selectedStrokeColor,
  onStrokeColorChange,
}: LeftToolbarProps) {
  const canEdit = userRole !== 'viewer'

  return (
    <aside className="flex w-14 shrink-0 flex-col items-center gap-0.5 border-r border-slate-200 bg-white py-2 overflow-y-auto">
      {canEdit && (
        <>
          {isEditingText ? (
            /* ── Text editing tools ── */
            <>
              <div className="mb-1 w-full px-1.5">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 text-center">
                  Text
                </div>
              </div>
              <FontSelector
                fontFamily={selectedFontFamily}
                fontSize={selectedFontSize}
                fontStyle={selectedFontStyle}
                textAlign={selectedTextAlign}
                textVerticalAlign={selectedTextVerticalAlign}
                textColor={selectedTextColor}
                showTextLayout={true}
                onFontChange={onFontChange}
                onTextStyleChange={onTextStyleChange}
                compact
              />
            </>
          ) : (
            /* ── Shape palette ── */
            <>
              <div className="mb-1 w-full px-1.5">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 text-center">
                  Shapes
                </div>
              </div>
              {ALL_SHAPES.map(({ type, label }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => onToolSelect(type)}
                  className={`flex h-9 w-9 flex-col items-center justify-center rounded-lg transition ${
                    activeTool === type
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  title={label}
                >
                  <ShapeIcon type={type} className="h-4.5 w-4.5" />
                </button>
              ))}

              <div className="my-1 h-px w-8 bg-slate-200" />

              <div className="mb-1 w-full px-1.5">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 text-center">
                  Lines
                </div>
              </div>
              {LINE_TYPES.map(({ type, label }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => onToolSelect(type)}
                  className={`flex h-9 w-9 flex-col items-center justify-center rounded-lg transition ${
                    activeTool === type
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  title={label}
                >
                  <ShapeIcon type={type} className="h-4.5 w-4.5" />
                </button>
              ))}
            </>
          )}

          {/* ── Selection tools (always visible when shape selected) ── */}
          {hasSelection && (
            <>
              <div className="my-1 h-px w-8 bg-slate-200" />

              {/* Fill color */}
              <ColorPicker
                selectedColor={selectedColor}
                onColorChange={onColorChange}
                compact
                label="Fill"
              />

              {/* Border color */}
              <BorderColorButton
                currentColor={selectedStrokeColor}
                onColorChange={onStrokeColorChange}
              />

              <div className="my-1 h-px w-8 bg-slate-200" />

              {/* Actions */}
              <button
                type="button"
                onClick={onDuplicate}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100"
                title="Duplicate (Ctrl+D)"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
              {canGroup && (
                <button
                  type="button"
                  onClick={onGroup}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100"
                  title="Group (Ctrl+G)"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h3l2 2h5a2 2 0 012 2v7a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
                  </svg>
                </button>
              )}
              {canUngroup && (
                <button
                  type="button"
                  onClick={onUngroup}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100"
                  title="Ungroup (Ctrl+Shift+G)"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h3l2 2h5a2 2 0 012 2v7a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                onClick={onDelete}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-red-500 transition hover:bg-red-50"
                title="Delete (Del)"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

/* ── Border color compact button with popover ── */

import { useState, useRef } from 'react'
import { useClickOutside } from '@/hooks/useClickOutside'
import { EXPANDED_PALETTE } from './ColorPicker'

const BORDER_COLORS = EXPANDED_PALETTE.slice(0, 12)

function BorderColorButton({
  currentColor,
  onColorChange,
}: {
  currentColor?: string | null
  onColorChange: (color: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null)
  useClickOutside([containerRef, panelRef], open, () => setOpen(false))

  const hasBorder = !!currentColor

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPopoverPos({ top: rect.top, left: rect.right + 8 })
    }
    setOpen(!open)
  }

  return (
    <div ref={containerRef}>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        className="flex h-9 w-9 flex-col items-center justify-center rounded-lg transition hover:bg-slate-100"
        title="Border color"
      >
        <span
          className="h-5 w-5 rounded border-2"
          style={{
            borderColor: hasBorder ? currentColor : '#94a3b8',
            backgroundColor: 'transparent',
          }}
        />
      </button>
      {open && popoverPos && (
        <div
          ref={panelRef}
          className="fixed z-[200] w-44 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
          style={{ top: popoverPos.top, left: popoverPos.left }}
        >
          <div className="text-xs font-medium text-slate-500 mb-2">Border</div>
          <div className="grid grid-cols-6 gap-1">
            <button
              type="button"
              onClick={() => { onColorChange(null); setOpen(false) }}
              className={`h-6 w-6 rounded-full border-2 border-slate-300 flex items-center justify-center transition hover:scale-110 ${
                !currentColor ? 'ring-2 ring-slate-700 ring-offset-1' : ''
              }`}
              title="No border"
            >
              <span className="text-xs text-red-400 font-bold">/</span>
            </button>
            {BORDER_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => { onColorChange(color); setOpen(false) }}
                className={`h-6 w-6 rounded-full transition hover:scale-110 ${
                  color === currentColor ? 'ring-2 ring-slate-700 ring-offset-1' : ''
                }`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
