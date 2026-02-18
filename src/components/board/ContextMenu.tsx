'use client'

import { useState, useEffect, useRef } from 'react'

interface ContextMenuProps {
  position: { x: number; y: number }
  onDelete: () => void
  onDuplicate: () => void
  onColorChange: (color: string) => void
  onClose: () => void
  recentColors?: string[]
  colors: string[]
  currentColor?: string
  /** When true, show line-specific stroke weight/dash options */
  isLine?: boolean
  onStrokeStyleChange?: (updates: { stroke_color?: string | null; stroke_width?: number; stroke_dash?: string }) => void
  onOpacityChange?: (opacity: number) => void
  currentStrokeWidth?: number
  currentStrokeDash?: string
  currentStrokeColor?: string | null
  currentOpacity?: number
  onBringToFront?: () => void
  onBringForward?: () => void
  onSendBackward?: () => void
  onSendToBack?: () => void
  onGroup?: () => void
  onUngroup?: () => void
  canGroup?: boolean
  canUngroup?: boolean
}

function MenuItem({
  onClick,
  label,
  shortcut,
  variant = 'default',
}: {
  onClick: () => void
  label: string
  shortcut?: string
  variant?: 'default' | 'danger'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition ${
        variant === 'danger'
          ? 'text-red-600 hover:bg-red-50'
          : 'text-slate-700 hover:bg-slate-100'
      }`}
    >
      {label}
      {shortcut && (
        <span className="ml-auto text-xs text-slate-400">{shortcut}</span>
      )}
    </button>
  )
}

const STROKE_PRESETS = [
  { stroke_width: 1, stroke_dash: undefined, label: 'Thin' },
  { stroke_width: 2, stroke_dash: undefined, label: 'Medium' },
  { stroke_width: 4, stroke_dash: undefined, label: 'Thick' },
  { stroke_width: 2, stroke_dash: '[8,4]', label: 'Dashed' },
  { stroke_width: 2, stroke_dash: '[2,2]', label: 'Dotted' },
]

const OPACITY_PRESETS = [
  { value: 0.25, label: '25%' },
  { value: 0.5, label: '50%' },
  { value: 0.75, label: '75%' },
  { value: 1, label: '100%' },
]

const STROKE_COLOR_SWATCHES = [
  '#000000', '#374151', '#EF4444', '#3B82F6', '#22C55E', '#EAB308',
]

export function ContextMenu({
  position,
  onDelete,
  onDuplicate,
  onColorChange,
  onClose,
  recentColors,
  colors,
  currentColor,
  isLine,
  onStrokeStyleChange,
  onOpacityChange,
  currentStrokeWidth,
  currentStrokeDash,
  currentStrokeColor,
  currentOpacity,
  onBringToFront,
  onBringForward,
  onSendBackward,
  onSendToBack,
  onGroup,
  onUngroup,
  canGroup,
  canUngroup,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [showAllColors, setShowAllColors] = useState(false)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    requestAnimationFrame(() => {
      window.addEventListener('mousedown', handleClickOutside)
    })
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const menuWidth = 200
  const x = position.x + menuWidth > window.innerWidth ? position.x - menuWidth : position.x
  const y = Math.min(position.y, window.innerHeight - 40)

  return (
    <div
      ref={menuRef}
      className="min-w-[180px] max-h-[80vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
      style={{
        position: 'fixed',
        top: y,
        left: x,
        zIndex: 200,
      }}
    >
      <MenuItem
        onClick={() => { onDuplicate(); onClose() }}
        label="Duplicate"
        shortcut="Ctrl+D"
      />
      <MenuItem
        onClick={() => { onDelete(); onClose() }}
        label="Delete"
        shortcut="Del"
        variant="danger"
      />

      {(onBringToFront || onSendToBack) && (
        <>
          <div className="my-1 h-px bg-slate-200" />
          <div className="px-3 py-1 text-xs font-medium text-slate-500">Layer</div>
          {onBringToFront && (
            <MenuItem onClick={() => { onBringToFront(); onClose() }} label="Bring to Front" />
          )}
          {onBringForward && (
            <MenuItem onClick={() => { onBringForward(); onClose() }} label="Bring Forward" />
          )}
          {onSendBackward && (
            <MenuItem onClick={() => { onSendBackward(); onClose() }} label="Send Backward" />
          )}
          {onSendToBack && (
            <MenuItem onClick={() => { onSendToBack(); onClose() }} label="Send to Back" />
          )}
        </>
      )}

      {(canGroup || canUngroup) && (
        <>
          <div className="my-1 h-px bg-slate-200" />
          {canGroup && onGroup && (
            <MenuItem onClick={() => { onGroup(); onClose() }} label="Group" shortcut="Ctrl+G" />
          )}
          {canUngroup && onUngroup && (
            <MenuItem onClick={() => { onUngroup(); onClose() }} label="Ungroup" shortcut="Ctrl+Shift+G" />
          )}
        </>
      )}

      {/* Line-specific stroke presets */}
      {isLine && onStrokeStyleChange && (
        <>
          <div className="my-1 h-px bg-slate-200" />
          <div className="px-3 py-2">
            <div className="mb-1.5 text-xs font-medium text-slate-500">Line style</div>
            <div className="flex flex-wrap gap-1">
              {STROKE_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    onStrokeStyleChange({ stroke_width: p.stroke_width, stroke_dash: p.stroke_dash })
                    onClose()
                  }}
                  className={`rounded px-2 py-1 text-xs font-medium transition ${
                    currentStrokeWidth === p.stroke_width && currentStrokeDash === p.stroke_dash
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Outline (stroke color) for all shapes */}
      {onStrokeStyleChange && (
        <>
          <div className="my-1 h-px bg-slate-200" />
          <div className="px-3 py-2">
            <div className="mb-1.5 text-xs font-medium text-slate-500">Outline</div>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => { onStrokeStyleChange({ stroke_color: null }); onClose() }}
                className={`h-6 w-6 rounded-full border-2 border-slate-300 transition hover:scale-110 flex items-center justify-center ${
                  !currentStrokeColor ? 'ring-2 ring-slate-700 ring-offset-1' : ''
                }`}
                title="No outline"
              >
                <span className="text-xs text-red-400 font-bold">/</span>
              </button>
              {STROKE_COLOR_SWATCHES.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => { onStrokeStyleChange({ stroke_color: color }); onClose() }}
                  className={`h-6 w-6 rounded-full transition hover:scale-110 ${
                    color === currentStrokeColor ? 'ring-2 ring-slate-700 ring-offset-1' : ''
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Opacity presets */}
      {onOpacityChange && (
        <>
          <div className="my-1 h-px bg-slate-200" />
          <div className="px-3 py-2">
            <div className="mb-1.5 text-xs font-medium text-slate-500">Opacity</div>
            <div className="flex flex-wrap gap-1">
              {OPACITY_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => { onOpacityChange(p.value); onClose() }}
                  className={`rounded px-2 py-1 text-xs font-medium transition ${
                    Math.abs((currentOpacity ?? 1) - p.value) < 0.01
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="my-1 h-px bg-slate-200" />
      <div className="px-3 py-2">
        <div className="mb-1.5 text-xs font-medium text-slate-500">Color</div>
        <div className="flex flex-wrap gap-1">
          {(showAllColors ? colors : (recentColors ?? colors.slice(0, 6))).map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => { onColorChange(color); onClose() }}
              className={`h-6 w-6 rounded-full transition hover:ring-2 hover:ring-slate-300 ${
                color === currentColor ? 'ring-2 ring-slate-700 ring-offset-2' : ''
              }`}
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
          {!showAllColors && (
            <button
              type="button"
              onClick={() => setShowAllColors(true)}
              className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-dashed border-slate-300 text-slate-400 transition hover:border-slate-400 hover:text-slate-600"
              title="More colors"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" role="img" aria-hidden="true">
                <title>More colors</title>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}
        </div>
        {showAllColors && (
          <div className="mt-2 flex gap-2">
            <input
              type="color"
              defaultValue={currentColor || '#6366f1'}
              onChange={(e) => { onColorChange(e.target.value); onClose() }}
              className="h-6 w-8 cursor-pointer rounded border border-slate-300 bg-transparent p-0"
              title="Custom color"
            />
            <span className="text-xs text-slate-400 self-center">Custom</span>
          </div>
        )}
      </div>
    </div>
  )
}
