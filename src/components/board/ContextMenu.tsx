'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { MarkerIcon, MARKER_TYPES, MARKER_LABELS } from './lineMarkers'
import { useBoardMutations } from '@/contexts/BoardMutationsContext'
import { useBoardContext } from '@/contexts/BoardContext'
import { STROKE_PRESETS, STROKE_COLOR_SWATCHES } from './styleConstants'

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
      className={`flex h-8 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium transition ${
        variant === 'danger'
          ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30'
          : 'text-charcoal hover:bg-parchment-dark hover:text-charcoal dark:text-parchment/80 dark:hover:bg-white/10 dark:hover:text-parchment'
      }`}
    >
      {label}
      {shortcut && (
        <span className="ml-auto text-[11px] font-mono text-charcoal/40 dark:text-parchment/30">{shortcut}</span>
      )}
    </button>
  )
}

const OPACITY_PRESETS = [
  { value: 0.25, label: '25%' },
  { value: 0.5, label: '50%' },
  { value: 0.75, label: '75%' },
  { value: 1, label: '100%' },
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
    onCommentOpen,
    onApiObjectClick,
  } = useBoardMutations()

  const { objects, isObjectLocked, activeGroupId } = useBoardContext()

  const ctxObj = objects.get(objectId)
  const isLine = ctxObj?.type === 'line' || ctxObj?.type === 'arrow'
  const isTable = ctxObj?.type === 'table'
  const isDataConnector = ctxObj?.type === 'data_connector'
  const isApiObject = ctxObj?.type === 'api_object'
  const isLocked = isObjectLocked(objectId)
  const currentColor = selectedColor ?? ctxObj?.color
  const currentStrokeWidth = ctxObj?.stroke_width
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
    const rafId = requestAnimationFrame(() => {
      window.addEventListener('mousedown', handleClickOutside)
    })
    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('mousedown', handleClickOutside)
    }
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
      className="min-w-[224px] max-h-[80vh] overflow-y-auto rounded-xl border border-parchment-border bg-parchment p-1.5 shadow-lg ring-1 ring-black/10 dark:bg-[#1E293B] dark:border-white/10 dark:ring-white/10 animate-[panel-in]"
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
          onClick={() => { onLock(); onClose() }}
          label="Lock"
        />
      )}
      {canUnlock && isLocked && (
        <MenuItem
          onClick={() => { onUnlock(); onClose() }}
          label="Unlock"
        />
      )}
      {isLocked && !canUnlock && (
        <div className="px-3 py-2 text-sm text-charcoal/50 dark:text-parchment/40">Shape locked</div>
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
          <hr className="my-1 border-parchment-border opacity-60 dark:border-white/10" />
          <MenuItem
            onClick={() => { onEditVertices(); onClose() }}
            label="Edit Vertices"
          />
        </>
      )}

      {!isLocked && (
        <>
          <hr className="my-1 border-parchment-border opacity-60 dark:border-white/10" />
          <div className="px-3 py-1 text-xs font-medium text-charcoal/50 dark:text-parchment/40">Layer</div>
          <div className="flex items-center gap-1 px-2 py-1">
            <button
              type="button"
              onClick={() => { onBringToFront(contextTargetId); onClose() }}
              className="rounded p-1.5 text-charcoal transition hover:bg-parchment-dark dark:text-parchment/80 dark:hover:bg-white/10"
              title="Bring to Front (Ctrl+Shift+])"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 11V5h6M19 13v6h-6" />
                <rect x="3" y="3" width="8" height="8" rx="1" strokeWidth={1.5} fill="none" />
                <rect x="13" y="13" width="8" height="8" rx="1" strokeWidth={1.5} fill="currentColor" fillOpacity={0.15} />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => { onBringForward(contextTargetId); onClose() }}
              className="rounded p-1.5 text-charcoal transition hover:bg-parchment-dark dark:text-parchment/80 dark:hover:bg-white/10"
              title="Bring Forward (Ctrl+])"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 11l5-5 5 5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => { onSendBackward(contextTargetId); onClose() }}
              className="rounded p-1.5 text-charcoal transition hover:bg-parchment-dark dark:text-parchment/80 dark:hover:bg-white/10"
              title="Send Backward (Ctrl+[)"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 13l5 5 5-5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18V6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => { onSendToBack(contextTargetId); onClose() }}
              className="rounded p-1.5 text-charcoal transition hover:bg-parchment-dark dark:text-parchment/80 dark:hover:bg-white/10"
              title="Send to Back (Ctrl+Shift+[)"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <rect x="13" y="3" width="8" height="8" rx="1" strokeWidth={1.5} fill="none" />
                <rect x="3" y="13" width="8" height="8" rx="1" strokeWidth={1.5} fill="currentColor" fillOpacity={0.15} />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 13v6h-6M5 11V5h6" />
              </svg>
            </button>
          </div>
        </>
      )}

      {!isLocked && (canGroup || canUngroup) && (
        <>
          <hr className="my-1 border-parchment-border opacity-60 dark:border-white/10" />
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
          <hr className="my-1 border-parchment-border opacity-60 dark:border-white/10" />
          <MenuItem onClick={() => { onAddRow(); onClose() }} label="Add Row" />
          <MenuItem onClick={() => { onDeleteRow(); onClose() }} label="Delete Row" />
          <MenuItem onClick={() => { onAddColumn(); onClose() }} label="Add Column" />
          <MenuItem onClick={() => { onDeleteColumn(); onClose() }} label="Delete Column" />
        </>
      )}

      {/* Stroke style presets */}
      {!isLocked && (
        <>
          <hr className="my-1 border-parchment-border opacity-60 dark:border-white/10" />
          <div className="px-3 py-2">
            <div className="mb-1.5 text-xs font-medium text-charcoal/50 dark:text-parchment/40">Stroke style</div>
            <div className="flex flex-wrap gap-1">
              {STROKE_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    onStrokeStyleChange({ stroke_width: p.stroke_width })
                    onClose()
                  }}
                  className={`rounded px-2 py-1 text-xs font-medium transition ${
                    currentStrokeWidth === p.stroke_width
                      ? 'bg-navy/10 text-navy dark:bg-navy/25 dark:text-parchment'
                      : 'bg-parchment-dark text-charcoal hover:bg-parchment-border dark:bg-white/10 dark:text-parchment/80 dark:hover:bg-white/20'
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
          <hr className="my-1 border-parchment-border opacity-60 dark:border-white/10" />
          <div className="px-3 py-2">
            <div className="mb-1.5 text-xs font-medium text-charcoal/50 dark:text-parchment/40">Start marker</div>
            <div className="flex flex-wrap gap-0.5">
              {MARKER_TYPES.map((mt) => (
                <button
                  key={`start-${mt}`}
                  type="button"
                  onClick={() => { onMarkerChange({ marker_start: mt }); onClose() }}
                  className={`rounded p-1 transition ${
                    currentMarkerStart === mt
                      ? 'bg-navy/10 text-navy dark:bg-navy/25 dark:text-parchment'
                      : 'text-charcoal hover:bg-parchment-dark dark:text-parchment/80 dark:hover:bg-white/10'
                  }`}
                  title={MARKER_LABELS[mt]}
                >
                  <MarkerIcon type={mt} size={20} />
                </button>
              ))}
            </div>
            <div className="mb-1.5 mt-2 text-xs font-medium text-charcoal/50 dark:text-parchment/40">End marker</div>
            <div className="flex flex-wrap gap-0.5">
              {MARKER_TYPES.map((mt) => (
                <button
                  key={`end-${mt}`}
                  type="button"
                  onClick={() => { onMarkerChange({ marker_end: mt }); onClose() }}
                  className={`rounded p-1 transition ${
                    currentMarkerEnd === mt
                      ? 'bg-navy/10 text-navy dark:bg-navy/25 dark:text-parchment'
                      : 'text-charcoal hover:bg-parchment-dark dark:text-parchment/80 dark:hover:bg-white/10'
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
          <hr className="my-1 border-parchment-border opacity-60 dark:border-white/10" />
          <div className="px-3 py-2">
            <div className="mb-1.5 text-xs font-medium text-charcoal/50 dark:text-parchment/40">Outline</div>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => { onStrokeStyleChange({ stroke_color: null }); onClose() }}
                className={`h-6 w-6 rounded-full border-2 border-parchment-border transition hover:scale-110 flex items-center justify-center dark:border-white/20 ${
                  !currentStrokeColor ? 'ring-2 ring-charcoal ring-offset-1 dark:ring-parchment/60' : ''
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
                    color === currentStrokeColor ? 'ring-2 ring-charcoal ring-offset-1 dark:ring-parchment/60' : ''
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
          <hr className="my-1 border-parchment-border opacity-60 dark:border-white/10" />
          <div className="px-3 py-2">
            <div className="mb-1.5 text-xs font-medium text-charcoal/50 dark:text-parchment/40">Opacity</div>
            <div className="flex flex-wrap gap-1">
              {OPACITY_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => { onOpacityChange(p.value); onClose() }}
                  className={`rounded px-2 py-1 text-xs font-medium transition ${
                    Math.abs((currentOpacity ?? 1) - p.value) < 0.01
                      ? 'bg-navy/10 text-navy dark:bg-navy/25 dark:text-parchment'
                      : 'bg-parchment-dark text-charcoal hover:bg-parchment-border dark:bg-white/10 dark:text-parchment/80 dark:hover:bg-white/20'
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
      <hr className="my-1 border-parchment-border opacity-60 dark:border-white/10" />
      <div className="px-3 py-2">
        <div className="mb-1.5 text-xs font-medium text-charcoal/50 dark:text-parchment/40">Color</div>
        <div className="flex flex-wrap gap-1">
          {displayColors.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => { onColorChange(color); onClose() }}
              className={`h-6 w-6 rounded-full transition hover:ring-2 hover:ring-parchment-border dark:hover:ring-white/30 ${
                color === currentColor ? 'ring-2 ring-charcoal ring-offset-2 dark:ring-parchment/60' : ''
              }`}
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
          {!showAllColors && (
            <button
              type="button"
              onClick={() => setShowAllColors(true)}
              className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-dashed border-parchment-border text-charcoal/40 transition hover:border-charcoal/30 hover:text-charcoal dark:border-white/20 dark:text-parchment/40 dark:hover:border-white/40 dark:hover:text-parchment"
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
              defaultValue={currentColor || '#1B3A6B'}
              onChange={(e) => { onColorChange(e.target.value); onClose() }}
              className="h-6 w-8 cursor-pointer rounded border border-parchment-border bg-transparent p-0 dark:border-white/20"
              title="Custom color"
            />
            <span className="text-xs text-charcoal/40 self-center dark:text-parchment/30">Custom</span>
          </div>
        )}
      </div>
      </>
      )}
      {/* Comments + API */}
      {!isLocked && !isLine && !isDataConnector && (
        <>
          <hr className="my-1 border-parchment-border opacity-60 dark:border-white/10" />
          <MenuItem
            onClick={() => { onCommentOpen?.(objectId); onClose() }}
            label="Add comment"
          />
        </>
      )}
      {!isLocked && isApiObject && (
        <MenuItem
          onClick={() => { onApiObjectClick?.(objectId); onClose() }}
          label="Configure API"
        />
      )}
    </div>
  )
}
