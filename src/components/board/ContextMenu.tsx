'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { MarkerIcon, MARKER_TYPES, MARKER_LABELS, MarkerType } from './lineMarkers'
import { useBoardMutations } from '@/contexts/BoardMutationsContext'
import { useBoardContext } from '@/contexts/BoardContext'

interface ContextMenuProps {
  position: { x: number; y: number }
  objectId: string
  onClose: () => void
  recentColors?: string[]
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
  { stroke_width: 1, stroke_dash: '[]', label: 'Thin' },
  { stroke_width: 2, stroke_dash: '[]', label: 'Medium' },
  { stroke_width: 4, stroke_dash: '[]', label: 'Thick' },
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
  objectId,
  onClose,
  recentColors,
}: ContextMenuProps) {
  const {
    onDelete,
    onDuplicate,
    onColorChange,
    onStrokeStyleChange,
    onOpacityChange,
    onBringToFront,
    onBringForward,
    onSendBackward,
    onSendToBack,
    onGroup,
    onUngroup,
    canGroup,
    canUngroup,
    onLock,
    onUnlock,
    canLock,
    canUnlock,
    onEditVertices,
    canEditVertices,
    onMarkerChange,
    onAddRow,
    onDeleteRow,
    onAddColumn,
    onDeleteColumn,
    colors,
    selectedColor,
  } = useBoardMutations()

  const { objects, isObjectLocked, activeGroupId } = useBoardContext()

  const ctxObj = objects.get(objectId)
  const isLine = ctxObj?.type === 'line' || ctxObj?.type === 'arrow'
  const isTable = ctxObj?.type === 'table'
  const isLocked = isObjectLocked(objectId)
  const currentColor = selectedColor ?? ctxObj?.color
  const currentStrokeWidth = ctxObj?.stroke_width
  const currentStrokeDash = ctxObj?.stroke_dash
  const currentStrokeColor = ctxObj?.stroke_color
  const currentOpacity = ctxObj?.opacity ?? 1
  const currentMarkerStart = ctxObj?.marker_start ?? (ctxObj?.type === 'arrow' ? 'arrow' : 'none')
  const currentMarkerEnd = ctxObj?.marker_end ?? (ctxObj?.type === 'arrow' ? 'arrow' : 'none')

  // Resolve context target ID — if shape is in a group and not inside active group,
  // z-order operations apply to the top-level group ancestor
  const contextTargetId = useMemo(() => {
    const obj = objects.get(objectId)
    if (obj?.parent_id && !activeGroupId) {
      let current = obj
      while (current.parent_id) {
        const parent = objects.get(current.parent_id)
        if (!parent) break
        current = parent
      }
      return current.id
    }
    return objectId
  }, [objectId, objects, activeGroupId])

  const menuRef = useRef<HTMLDivElement>(null)
  const [showAllColors, setShowAllColors] = useState(false)
  const [pos, setPos] = useState({ x: position.x, y: position.y })

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

  // Clamp position so menu stays within viewport
  useEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let nx = position.x
    let ny = position.y
    if (nx + rect.width > vw) nx = Math.max(0, vw - rect.width - 8)
    if (ny + rect.height > vh) ny = Math.max(0, vh - rect.height - 8)
    if (nx !== pos.x || ny !== pos.y) setPos({ x: nx, y: ny })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position.x, position.y])

  const displayColors = showAllColors ? colors : (recentColors ?? colors.slice(0, 6))

  return (
    <div
      ref={menuRef}
      className="min-w-[180px] max-h-[80vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
      style={{
        position: 'fixed',
        top: pos.y,
        left: pos.x,
        zIndex: 200,
      }}
    >
      {/* Lock/Unlock */}
      {canLock && !isLocked && (
        <MenuItem
          onClick={() => { onLock(); }}
          label="Lock"
        />
      )}
      {canUnlock && isLocked && (
        <MenuItem
          onClick={() => { onUnlock(); }}
          label="Unlock"
        />
      )}
      {isLocked && !canUnlock && (
        <div className="px-3 py-2 text-sm text-slate-400">Shape locked</div>
      )}

      {!isLocked && (
        <>
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
        </>
      )}

      {!isLocked && canEditVertices && (
        <>
          <div className="my-1 h-px bg-slate-200" />
          <MenuItem
            onClick={() => { onEditVertices(); onClose() }}
            label="Edit Vertices"
          />
        </>
      )}

      {!isLocked && (
        <>
          <div className="my-1 h-px bg-slate-200" />
          <div className="px-3 py-1 text-xs font-medium text-slate-500">Layer</div>
          <div className="flex items-center gap-1 px-2 py-1">
            <button
              type="button"
              onClick={() => { onBringToFront(contextTargetId); onClose() }}
              className="rounded p-1.5 text-slate-600 transition hover:bg-slate-100"
              title="Bring to Front (Ctrl+Shift+])"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 11V5h6M19 13v6h-6" />
                <rect x="3" y="3" width="8" height="8" rx="1" strokeWidth={2} fill="none" />
                <rect x="13" y="13" width="8" height="8" rx="1" strokeWidth={2} fill="currentColor" fillOpacity={0.15} />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => { onBringForward(contextTargetId); onClose() }}
              className="rounded p-1.5 text-slate-600 transition hover:bg-slate-100"
              title="Bring Forward (Ctrl+])"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 11l5-5 5 5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => { onSendBackward(contextTargetId); onClose() }}
              className="rounded p-1.5 text-slate-600 transition hover:bg-slate-100"
              title="Send Backward (Ctrl+[)"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 13l5 5 5-5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18V6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => { onSendToBack(contextTargetId); onClose() }}
              className="rounded p-1.5 text-slate-600 transition hover:bg-slate-100"
              title="Send to Back (Ctrl+Shift+[)"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="13" y="3" width="8" height="8" rx="1" strokeWidth={2} fill="none" />
                <rect x="3" y="13" width="8" height="8" rx="1" strokeWidth={2} fill="currentColor" fillOpacity={0.15} />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 13v6h-6M5 11V5h6" />
              </svg>
            </button>
          </div>
        </>
      )}

      {!isLocked && (canGroup || canUngroup) && (
        <>
          <div className="my-1 h-px bg-slate-200" />
          {canGroup && (
            <MenuItem onClick={() => { onGroup(); onClose() }} label="Group" shortcut="Ctrl+G" />
          )}
          {canUngroup && (
            <MenuItem onClick={() => { onUngroup(); onClose() }} label="Ungroup" shortcut="Ctrl+Shift+G" />
          )}
        </>
      )}

      {/* Table operations */}
      {!isLocked && isTable && (
        <>
          <div className="my-1 h-px bg-slate-200" />
          <MenuItem onClick={() => onAddRow()} label="Add Row" />
          <MenuItem onClick={() => onDeleteRow()} label="Delete Row" />
          <MenuItem onClick={() => onAddColumn()} label="Add Column" />
          <MenuItem onClick={() => onDeleteColumn()} label="Delete Column" />
        </>
      )}

      {/* Stroke style presets */}
      {!isLocked && (
        <>
          <div className="my-1 h-px bg-slate-200" />
          <div className="px-3 py-2">
            <div className="mb-1.5 text-xs font-medium text-slate-500">Stroke style</div>
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
                    currentStrokeWidth === p.stroke_width && (currentStrokeDash ?? '[]') === p.stroke_dash
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

      {/* Markers (lines only) */}
      {!isLocked && isLine && (
        <>
          <div className="my-1 h-px bg-slate-200" />
          <div className="px-3 py-2">
            <div className="mb-1.5 text-xs font-medium text-slate-500">Start marker</div>
            <div className="flex flex-wrap gap-0.5">
              {MARKER_TYPES.map((mt) => (
                <button
                  key={`start-${mt}`}
                  type="button"
                  onClick={() => { onMarkerChange({ marker_start: mt }); onClose() }}
                  className={`rounded p-1 transition ${
                    currentMarkerStart === mt
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  title={MARKER_LABELS[mt]}
                >
                  <MarkerIcon type={mt} size={20} />
                </button>
              ))}
            </div>
            <div className="mb-1.5 mt-2 text-xs font-medium text-slate-500">End marker</div>
            <div className="flex flex-wrap gap-0.5">
              {MARKER_TYPES.map((mt) => (
                <button
                  key={`end-${mt}`}
                  type="button"
                  onClick={() => { onMarkerChange({ marker_end: mt }); onClose() }}
                  className={`rounded p-1 transition ${
                    currentMarkerEnd === mt
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  title={MARKER_LABELS[mt]}
                >
                  <MarkerIcon type={mt} size={20} />
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Outline (stroke color) for all shapes */}
      {!isLocked && (
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
      {!isLocked && (
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

      {!isLocked && (
      <>
      <div className="my-1 h-px bg-slate-200" />
      <div className="px-3 py-2">
        <div className="mb-1.5 text-xs font-medium text-slate-500">Color</div>
        <div className="flex flex-wrap gap-1">
          {displayColors.map((color) => (
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
      </>
      )}
    </div>
  )
}
