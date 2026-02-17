'use client'

import { useEffect, useRef } from 'react'

interface ContextMenuProps {
  position: { x: number; y: number }
  onDelete: () => void
  onDuplicate: () => void
  onColorChange: (color: string) => void
  onClose: () => void
  colors: string[]
  currentColor?: string
  /** When true, show stroke weight/dash options (for lines) */
  isLine?: boolean
  onStrokeChange?: (updates: { stroke_width?: number; stroke_dash?: string }) => void
  currentStrokeWidth?: number
  currentStrokeDash?: string
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

export function ContextMenu({
  position,
  onDelete,
  onDuplicate,
  onColorChange,
  onClose,
  colors,
  currentColor,
  isLine,
  onStrokeChange,
  currentStrokeWidth,
  currentStrokeDash,
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
  const menuHeight = 340
  const x = position.x + menuWidth > window.innerWidth ? position.x - menuWidth : position.x
  const y = position.y + menuHeight > window.innerHeight ? position.y - menuHeight : position.y

  return (
    <div
      ref={menuRef}
      className="min-w-[180px] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
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

      {isLine && onStrokeChange && (
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
                    onStrokeChange({ stroke_width: p.stroke_width, stroke_dash: p.stroke_dash })
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

      <div className="my-1 h-px bg-slate-200" />
      <div className="px-3 py-2">
        <div className="mb-1.5 text-xs font-medium text-slate-500">Color</div>
        <div className="flex flex-wrap gap-1">
          {colors.map((color) => (
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
        </div>
      </div>
    </div>
  )
}
