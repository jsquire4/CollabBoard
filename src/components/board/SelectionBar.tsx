'use client'

import { useRef, useEffect, useState } from 'react'
import { useBoardContext } from '@/contexts/BoardContext'
import { useBoardMutations } from '@/contexts/BoardMutationsContext'
import { selectionBBox } from '@/lib/geometry/bbox'

// ── Text-bearing types that show the TextColor button ─────────────────
// Mirrors the TEXT_TYPES set used in BoardClient for font controls.
const TEXT_COLOR_TYPES = new Set([
  'sticky_note',
  'text',
  'rectangle',
  'circle',
  'triangle',
  'chevron',
  'parallelogram',
  'ngon',
  'frame',
])

// ── Vector types that have no fill color ──────────────────────────────
const NO_FILL_TYPES = new Set(['line', 'arrow', 'data_connector'])

// ── Icon SVGs ─────────────────────────────────────────────────────────

function IconTextColor({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <text
        x="7"
        y="10"
        textAnchor="middle"
        fontSize="10"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
        fill="currentColor"
      >
        T
      </text>
      <rect x="1" y="11.5" width="12" height="1.5" rx="0.75" fill={color} />
    </svg>
  )
}

function IconFill({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" fill={color} stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

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

function IconDelete() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M2 4h10M5 4V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V4M5.5 6.5v4M8.5 6.5v4M3.5 4l.5 7.5a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5L10.5 4" />
    </svg>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────

interface SelectionBarProps {
  stagePos: { x: number; y: number }
  stageScale: number
}

const BASE_BTN =
  'flex h-9 w-9 items-center justify-center rounded-full transition-colors disabled:opacity-40'
const NORMAL_BTN =
  `${BASE_BTN} text-parchment/80 hover:bg-white/10`
const DELETE_BTN =
  `${BASE_BTN} text-red-400 hover:bg-red-950/30`

const Divider = () => (
  <div className="w-px h-5 bg-white/20 mx-1" aria-hidden="true" />
)

// ── Component ──────────────────────────────────────────────────────────

export function SelectionBar({ stagePos, stageScale }: SelectionBarProps) {
  const { selectedIds, objects } = useBoardContext()
  const {
    selectedColor,
    onColorChange,
    onTextColorChange,
    onDelete,
    onDuplicate,
    anySelectedLocked,
    onStrokeStyleChange,
    onOpacityChange,
  } = useBoardMutations()

  const barRef = useRef<HTMLDivElement>(null)
  const fillInputRef = useRef<HTMLInputElement>(null)
  const strokeInputRef = useRef<HTMLInputElement>(null)
  const textColorInputRef = useRef<HTMLInputElement>(null)
  const [barPos, setBarPos] = useState<{ top: number; left: number } | null>(null)

  const [opacityOpen, setOpacityOpen] = useState(false)
  const opacityBtnRef = useRef<HTMLButtonElement>(null)
  const opacityPopoverRef = useRef<HTMLDivElement>(null)

  // ── Position calculation (mirrors FloatingPropertyPanel exactly) ────
  useEffect(() => {
    if (selectedIds.size === 0) {
      setBarPos(null)
      return
    }

    const bbox = selectionBBox(selectedIds, objects)
    if (!bbox) {
      setBarPos(null)
      return
    }

    // Convert canvas top-center to screen coordinates
    const screenLeft = bbox.minX * stageScale + stagePos.x
    const screenRight = bbox.maxX * stageScale + stagePos.x
    const screenTop = bbox.minY * stageScale + stagePos.y

    const barWidth = barRef.current?.offsetWidth ?? 240
    const barHeight = barRef.current?.offsetHeight ?? 40

    const GAP = 8
    const MARGIN = 8

    // Centered above selection, GAP below the bar's bottom edge
    let left = (screenLeft + screenRight) / 2 - barWidth / 2
    let top = screenTop - barHeight - GAP

    // Clamp to viewport edges
    const vw = window.innerWidth
    const vh = window.innerHeight

    left = Math.max(MARGIN, Math.min(left, vw - barWidth - MARGIN))
    top = Math.max(MARGIN, Math.min(top, vh - barHeight - MARGIN))

    setBarPos({ top, left })
  }, [selectedIds, objects, stagePos, stageScale])

  // ── Opacity popover outside-click handler ───────────────────────────
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

  // ── Conditional animation: only animate the very first appearance ───
  const barWasVisibleRef = useRef(false)
  useEffect(() => {
    barWasVisibleRef.current = barPos !== null
  }, [barPos])

  if (selectedIds.size === 0) return null

  const justAppeared = barPos !== null && !barWasVisibleRef.current

  // ── Derive per-object properties from the first selected object ─────
  const firstId = selectedIds.values().next().value as string | undefined
  const firstObj = firstId ? objects.get(firstId) : undefined

  const fillColor = selectedColor ?? '#5B8DEF'
  const strokeColor = firstObj?.stroke_color ?? '#1B3A6B'
  const opacity = firstObj?.opacity ?? 1
  const textColor = firstObj?.text_color ?? '#000000'

  // ── Feature flags based on selection composition ─────────────────────
  // Show text color button only when ALL selected objects are text-bearing types
  const allAreTextType = [...selectedIds].every(id => {
    const obj = objects.get(id)
    return obj ? TEXT_COLOR_TYPES.has(obj.type) : false
  })

  // Hide fill button when ALL selected objects are vector (no-fill) types
  const allAreNoFill = [...selectedIds].every(id => {
    const obj = objects.get(id)
    return obj ? NO_FILL_TYPES.has(obj.type) : false
  })

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label="Selection properties"
      className={[
        'fixed z-[150]',
        'bg-charcoal/95 dark:bg-[#1E293B]',
        'border border-white/10 rounded-2xl shadow-lg',
        'px-2 py-1.5 flex items-center gap-1',
        justAppeared ? 'animate-[selection-bar-in]' : '',
      ].join(' ')}
      style={barPos ? { top: barPos.top, left: barPos.left } : { visibility: 'hidden' }}
    >
      {/* TextColor — only for text-bearing object types */}
      {allAreTextType && (
        <>
          <input
            ref={textColorInputRef}
            type="color"
            className="sr-only"
            aria-hidden="true"
            value={textColor}
            onChange={e => onTextColorChange(e.target.value)}
          />
          <button
            className={`${NORMAL_BTN} ring-offset-charcoal`}
            aria-label="Text color"
            onClick={() => textColorInputRef.current?.click()}
            disabled={anySelectedLocked}
            title="Text color"
          >
            <IconTextColor color={textColor} />
          </button>
        </>
      )}

      {/* Fill color — hidden for vector types (line/arrow) */}
      {!allAreNoFill && (
        <>
          <input
            ref={fillInputRef}
            type="color"
            className="sr-only"
            aria-hidden="true"
            value={fillColor}
            onChange={e => onColorChange(e.target.value)}
          />
          <button
            className={NORMAL_BTN}
            aria-label="Fill color"
            onClick={() => fillInputRef.current?.click()}
            disabled={anySelectedLocked || !onColorChange}
            title="Fill color"
          >
            <IconFill color={fillColor} />
          </button>
        </>
      )}

      {/* Stroke color */}
      <input
        ref={strokeInputRef}
        type="color"
        className="sr-only"
        aria-hidden="true"
        value={strokeColor}
        onChange={e => onStrokeStyleChange({ stroke_color: e.target.value })}
      />
      <button
        className={NORMAL_BTN}
        aria-label="Stroke color"
        onClick={() => strokeInputRef.current?.click()}
        disabled={anySelectedLocked || !onStrokeStyleChange}
        title="Stroke color"
      >
        <IconStroke />
      </button>

      {/* Opacity */}
      <div className="relative">
        <button
          ref={opacityBtnRef}
          className={`${NORMAL_BTN} w-auto px-1.5 text-xs font-medium tabular-nums`}
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
            className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-lg border border-white/10 bg-charcoal px-3 py-2 shadow-lg dark:bg-[#1E293B]"
          >
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={opacity}
              onChange={e => onOpacityChange(parseFloat(e.target.value))}
              className="w-28 accent-leather"
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
