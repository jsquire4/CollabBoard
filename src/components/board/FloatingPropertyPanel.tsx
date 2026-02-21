'use client'

import { useRef, useEffect, useState } from 'react'
import { useBoardContext } from '@/contexts/BoardContext'
import { useBoardMutations } from '@/contexts/BoardMutationsContext'
import type { BoardObject } from '@/types/board'

interface FloatingPropertyPanelProps {
  stagePos: { x: number; y: number }
  stageScale: number
}

// ── Bounding box helpers ──────────────────────────────────────────────

interface BBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function objectBBox(obj: BoardObject): BBox {
  // Vector types (line, arrow, data_connector) use x2/y2
  if (obj.x2 != null && obj.y2 != null) {
    return {
      minX: Math.min(obj.x, obj.x2),
      minY: Math.min(obj.y, obj.y2),
      maxX: Math.max(obj.x, obj.x2),
      maxY: Math.max(obj.y, obj.y2),
    }
  }
  return {
    minX: obj.x,
    minY: obj.y,
    maxX: obj.x + obj.width,
    maxY: obj.y + obj.height,
  }
}

function selectionBBox(selectedIds: Set<string>, objects: Map<string, BoardObject>): BBox | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const id of selectedIds) {
    const obj = objects.get(id)
    if (!obj) continue
    const bb = objectBBox(obj)
    if (bb.minX < minX) minX = bb.minX
    if (bb.minY < minY) minY = bb.minY
    if (bb.maxX > maxX) maxX = bb.maxX
    if (bb.maxY > maxY) maxY = bb.maxY
  }

  if (minX === Infinity) return null
  return { minX, minY, maxX, maxY }
}

// ── Icon SVGs ─────────────────────────────────────────────────────────

function IconStroke() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="2" y="2" width="10" height="10" rx="1.5" />
    </svg>
  )
}

function IconDuplicate() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="4" y="4" width="8" height="8" rx="1" />
      <path d="M2 10V3a1 1 0 0 1 1-1h7" />
    </svg>
  )
}

function IconGroup() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="1" y="1" width="5" height="5" rx="1" />
      <rect x="8" y="1" width="5" height="5" rx="1" />
      <rect x="1" y="8" width="5" height="5" rx="1" />
      <rect x="8" y="8" width="5" height="5" rx="1" />
    </svg>
  )
}

function IconUngroup() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="1" y="1" width="12" height="12" rx="1.5" strokeDasharray="3 2" />
      <line x1="7" y1="1" x2="7" y2="13" />
      <line x1="1" y1="7" x2="13" y2="7" />
    </svg>
  )
}

function IconDelete() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M2 4h10M5 4V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V4M5.5 6.5v4M8.5 6.5v4M3.5 4l.5 7.5a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5L10.5 4" />
    </svg>
  )
}

function IconLayerForward() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M7 10V4M4 7l3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconLayerBack() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M7 4v6M4 7l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconLockOpen() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="2" y="7" width="10" height="6" rx="1" />
      <path d="M4 7V4.5a3 3 0 0 1 6 0" strokeLinecap="round" />
    </svg>
  )
}

function IconLockClosed() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="2" y="7" width="10" height="6" rx="1" />
      <path d="M4 7V4.5a3 3 0 0 1 6 0v2.5" strokeLinecap="round" />
    </svg>
  )
}

// ── Component ─────────────────────────────────────────────────────────

const BASE_BTN =
  'flex h-7 w-7 items-center justify-center rounded-lg transition-colors disabled:opacity-40'
const NORMAL_BTN =
  `${BASE_BTN} text-charcoal dark:text-parchment/80 hover:bg-parchment-dark dark:hover:bg-white/10`
const DELETE_BTN =
  `${BASE_BTN} text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30`

const Divider = () => (
  <div className="w-px h-5 bg-parchment-border dark:bg-white/10 mx-1" aria-hidden="true" />
)

export function FloatingPropertyPanel({ stagePos, stageScale }: FloatingPropertyPanelProps) {
  const { selectedIds, objects } = useBoardContext()
  const {
    selectedColor,
    onColorChange,
    onDelete,
    onDuplicate,
    onGroup,
    onUngroup,
    canGroup,
    canUngroup,
    anySelectedLocked,
    onStrokeStyleChange,
    onOpacityChange,
    onBringForward,
    onSendBackward,
    onLock,
    onUnlock,
    canLock,
    canUnlock,
  } = useBoardMutations()

  const panelRef = useRef<HTMLDivElement>(null)
  const colorInputRef = useRef<HTMLInputElement>(null)
  const strokeInputRef = useRef<HTMLInputElement>(null)
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null)

  const [opacityOpen, setOpacityOpen] = useState(false)
  const opacityBtnRef = useRef<HTMLButtonElement>(null)
  const opacityPopoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selectedIds.size === 0) {
      setPanelPos(null)
      return
    }

    const bbox = selectionBBox(selectedIds, objects)
    if (!bbox) {
      setPanelPos(null)
      return
    }

    // Convert canvas top-center to screen coordinates
    const screenLeft = bbox.minX * stageScale + stagePos.x
    const screenRight = bbox.maxX * stageScale + stagePos.x
    const screenTop = bbox.minY * stageScale + stagePos.y

    const panelWidth = panelRef.current?.offsetWidth ?? 200
    const panelHeight = panelRef.current?.offsetHeight ?? 36

    const GAP = 8
    const MARGIN = 8

    // Centered above selection, 8px gap below the panel bottom
    let left = (screenLeft + screenRight) / 2 - panelWidth / 2
    let top = screenTop - panelHeight - GAP

    // Clamp to viewport edges
    const vw = window.innerWidth
    const vh = window.innerHeight

    left = Math.max(MARGIN, Math.min(left, vw - panelWidth - MARGIN))
    top = Math.max(MARGIN, Math.min(top, vh - panelHeight - MARGIN))

    setPanelPos({ top, left })
  }, [selectedIds, objects, stagePos, stageScale])

  useEffect(() => {
    if (!opacityOpen) return
    const handleMouseDown = (e: MouseEvent) => {
      if (
        opacityPopoverRef.current?.contains(e.target as Node) ||
        opacityBtnRef.current?.contains(e.target as Node)
      ) return
      setOpacityOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [opacityOpen])

  const panelWasVisibleRef = useRef(false)
  useEffect(() => {
    panelWasVisibleRef.current = panelPos !== null
  }, [panelPos])

  if (selectedIds.size === 0) return null

  const justAppeared = panelPos !== null && !panelWasVisibleRef.current

  const swatchColor = selectedColor ?? '#5B8DEF'

  // Derive the current stroke color from the first selected object
  const firstId = selectedIds.values().next().value
  const selectedStrokeColor = firstId ? (objects.get(firstId)?.stroke_color ?? null) : null
  const opacity = firstId ? (objects.get(firstId)?.opacity ?? 1) : 1

  return (
    <div
      ref={panelRef}
      role="toolbar"
      aria-label="Selection properties"
      className={`fixed rounded-xl shadow-lg ring-1 ring-black/10 dark:ring-white/10 bg-parchment dark:bg-[#1E293B] border border-parchment-border dark:border-white/10 backdrop-blur-sm px-2 py-1.5 flex items-center gap-1 z-[150]${justAppeared ? ' animate-[panel-in]' : ''}`}
      style={panelPos ? { top: panelPos.top, left: panelPos.left } : { visibility: 'hidden' }}
    >
      {/* Color swatch */}
      <input
        ref={colorInputRef}
        type="color"
        className="sr-only"
        aria-hidden="true"
        value={swatchColor}
        onChange={e => onColorChange?.(e.target.value)}
      />
      <button
        className={NORMAL_BTN}
        aria-label="Color"
        onClick={() => colorInputRef.current?.click()}
        disabled={anySelectedLocked || !onColorChange}
        title="Change color"
      >
        <div
          className="w-4 h-4 rounded-full border border-black/20"
          style={{ backgroundColor: swatchColor }}
        />
      </button>

      {/* Stroke/outline style */}
      <input
        ref={strokeInputRef}
        type="color"
        className="sr-only"
        aria-hidden="true"
        value={selectedStrokeColor ?? '#1B3A6B'}
        onChange={e => onStrokeStyleChange?.({ stroke_color: e.target.value })}
      />
      <button
        className={NORMAL_BTN}
        aria-label="Style"
        onClick={() => strokeInputRef.current?.click()}
        disabled={anySelectedLocked || !onStrokeStyleChange}
        title="Stroke color"
      >
        <IconStroke />
      </button>

      {/* Opacity button */}
      <div className="relative">
        <button
          ref={opacityBtnRef}
          className={NORMAL_BTN + ' min-w-[36px] text-xs font-medium tabular-nums'}
          aria-label="Opacity"
          onClick={() => setOpacityOpen(prev => !prev)}
          disabled={anySelectedLocked}
          title="Opacity"
        >
          {Math.round(opacity * 100)}%
        </button>
        {opacityOpen && (
          <div
            ref={opacityPopoverRef}
            className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-lg border border-parchment-border bg-parchment px-3 py-2 shadow-lg dark:border-white/10 dark:bg-[#1E293B]"
          >
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={opacity}
              onChange={e => onOpacityChange(parseFloat(e.target.value))}
              className="w-28 accent-navy"
              aria-label="Opacity slider"
            />
          </div>
        )}
      </div>

      <Divider />

      {/* Duplicate */}
      <button
        className={NORMAL_BTN}
        aria-label="Duplicate"
        onClick={onDuplicate}
        disabled={anySelectedLocked}
        title="Duplicate (⌘D)"
      >
        <IconDuplicate />
      </button>

      {/* Group (conditional) */}
      {canGroup && (
        <button
          className={NORMAL_BTN}
          aria-label="Group"
          onClick={onGroup}
          disabled={anySelectedLocked}
          title="Group (⌘G)"
        >
          <IconGroup />
        </button>
      )}

      {/* Ungroup (conditional) */}
      {canUngroup && (
        <button
          className={NORMAL_BTN}
          aria-label="Ungroup"
          onClick={onUngroup}
          disabled={anySelectedLocked}
          title="Ungroup (⌘⇧G)"
        >
          <IconUngroup />
        </button>
      )}

      <Divider />

      {/* Bring Forward */}
      <button
        className={NORMAL_BTN}
        aria-label="Bring forward"
        onClick={() => firstId && onBringForward(firstId)}
        disabled={anySelectedLocked}
        title="Bring forward (⌘])"
      >
        <IconLayerForward />
      </button>

      {/* Send Backward */}
      <button
        className={NORMAL_BTN}
        aria-label="Send backward"
        onClick={() => firstId && onSendBackward(firstId)}
        disabled={anySelectedLocked}
        title="Send backward (⌘[)"
      >
        <IconLayerBack />
      </button>

      {/* Lock/Unlock (conditional) */}
      {(canLock || anySelectedLocked) && (
        <>
          <Divider />
          {anySelectedLocked && canUnlock ? (
            <button
              className={NORMAL_BTN}
              aria-label="Unlock"
              onClick={onUnlock}
              title="Unlock"
            >
              <IconLockClosed />
            </button>
          ) : anySelectedLocked && !canUnlock ? (
            <button
              className={NORMAL_BTN}
              aria-label="Locked"
              disabled
              title="Locked (no permission to unlock)"
            >
              <IconLockClosed />
            </button>
          ) : canLock ? (
            <button
              className={NORMAL_BTN}
              aria-label="Lock"
              onClick={onLock}
              title="Lock"
            >
              <IconLockOpen />
            </button>
          ) : null}
        </>
      )}

      <Divider />

      {/* Delete */}
      <button
        className={DELETE_BTN}
        aria-label="Delete"
        onClick={onDelete}
        disabled={anySelectedLocked}
        title="Delete (⌫)"
      >
        <IconDelete />
      </button>
    </div>
  )
}
