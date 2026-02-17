'use client'

import { useState, useRef } from 'react'
import { BoardObjectType } from '@/types/board'
import { useClickOutside } from '@/hooks/useClickOutside'
import { ShapeIcon } from './ShapeIcon'
import { EXPANDED_PALETTE } from './ColorPicker'

const BASIC_SHAPES: { type: BoardObjectType; label: string }[] = [
  { type: 'sticky_note', label: 'Sticky Note' },
  { type: 'rectangle', label: 'Rectangle' },
  { type: 'circle', label: 'Circle' },
  { type: 'frame', label: 'Frame' },
]

const LINE_PRESETS: { stroke_width: number; stroke_dash?: string; label: string }[] = [
  { stroke_width: 1, label: 'Thin' },
  { stroke_width: 2, label: 'Medium' },
  { stroke_width: 4, label: 'Thick' },
  { stroke_width: 2, stroke_dash: '[8,4]', label: 'Dashed' },
  { stroke_width: 2, stroke_dash: '[2,2]', label: 'Dotted' },
]

const POLYGON_SHAPES: { type: BoardObjectType; label: string }[] = [
  { type: 'triangle', label: 'Triangle' },
  { type: 'chevron', label: 'Hexagon' },
  { type: 'arrow', label: 'Arrow' },
  { type: 'parallelogram', label: 'Parallelogram' },
]

export type ShapeAddHandler = (
  type: BoardObjectType,
  overrides?: Partial<{ stroke_width: number; stroke_dash: string; color: string }>
) => void

interface ShapeSelectorProps {
  onAddShape: ShapeAddHandler
  disabled?: boolean
  compact?: boolean
}

export function ShapeSelector({ onAddShape, disabled, compact }: ShapeSelectorProps) {
  const [showPopover, setShowPopover] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  useClickOutside(popoverRef, showPopover, () => setShowPopover(false))

  const content = (
    <div className="w-64 space-y-4 p-3">
      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
          Basic
        </div>
        <div className="grid grid-cols-4 gap-2">
          {BASIC_SHAPES.map(({ type, label }) => (
            <button
              key={type}
              type="button"
              onClick={() => { onAddShape(type); setShowPopover(false) }}
              disabled={disabled}
              className="flex flex-col items-center gap-1 rounded-lg p-2 transition hover:bg-slate-100 disabled:opacity-50"
              title={label}
            >
              <ShapeIcon type={type} className="h-6 w-6" />
              <span className="text-[10px] font-medium text-slate-600">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
          Lines
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {LINE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  onAddShape('line', {
                    stroke_width: preset.stroke_width,
                    stroke_dash: preset.stroke_dash,
                  })
                  setShowPopover(false)
                }}
                disabled={disabled}
                className="rounded border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="text-[10px] text-slate-500">Click to add line at viewport center</div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
          Shapes
        </div>
        <div className="grid grid-cols-4 gap-2">
          {POLYGON_SHAPES.map(({ type, label }) => (
            <button
              key={type}
              type="button"
              onClick={() => { onAddShape(type); setShowPopover(false) }}
              disabled={disabled}
              className="flex flex-col items-center gap-1 rounded-lg p-2 transition hover:bg-slate-100 disabled:opacity-50"
              title={label}
            >
              <ShapeIcon type={type} className="h-6 w-6" />
              <span className="text-[10px] font-medium text-slate-600">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
          Line color
        </div>
        <div className="flex flex-wrap gap-1">
          {EXPANDED_PALETTE.slice(0, 12).map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => {
                onAddShape('line', { color })
                setShowPopover(false)
              }}
              disabled={disabled}
              className="h-5 w-5 rounded-full transition hover:scale-110 disabled:opacity-50"
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
      </div>
    </div>
  )

  if (compact) {
    return (
      <div className="relative" ref={popoverRef}>
        <button
          type="button"
          onClick={() => setShowPopover(!showPopover)}
          disabled={disabled}
          aria-label="Add shape"
          aria-expanded={showPopover}
          aria-haspopup="dialog"
          className="flex h-10 w-10 flex-col items-center justify-center rounded-lg transition hover:bg-slate-100 disabled:opacity-50"
          title="Add shape"
        >
          <ShapeIcon type="rectangle" className="h-5 w-5" />
        </button>
        {showPopover && (
          <div
            role="dialog"
            aria-label="Shape selector"
            className="absolute left-full top-0 z-50 ml-2 rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            {content}
          </div>
        )}
      </div>
    )
  }

  return <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg">{content}</div>
}
