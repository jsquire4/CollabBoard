'use client'

import { useRef, useState, useMemo } from 'react'
import { useBoardContext } from '@/contexts/BoardContext'
import { useBoardMutations } from '@/contexts/BoardMutationsContext'
import { selectionBBox } from '@/lib/geometry/bbox'
import { useCanvasOverlayPosition } from '@/hooks/board/useCanvasOverlayPosition'
import { RICH_TEXT_ENABLED } from '@/lib/richText'
import { RichTextToolbar } from './RichTextToolbar'
import type { Editor } from '@tiptap/react'
import type { FontStyle } from '@/types/board'

// ── Text-bearing types that show the Text tab ──────────────────────────
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
  'status_badge',
  'section_header',
  'metric_card',
  'checklist',
])

// ── Vector types that have no fill color ─────────────────────────────
const NO_FILL_TYPES = new Set(['line', 'arrow', 'data_connector'])

// ── Mode type ────────────────────────────────────────────────────────
type SelectionMode = 'text' | 'fill' | 'border' | 'arrange' | 'lock' | null

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

function IconArrange() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="1" y="4" width="8" height="8" rx="1" />
      <path d="M5 4V2.5A1.5 1.5 0 0 1 6.5 1H11.5A1.5 1.5 0 0 1 13 2.5V7.5A1.5 1.5 0 0 1 11.5 9H10" />
    </svg>
  )
}

function IconLock({ locked }: { locked?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="3" y="6" width="8" height="7" rx="1" />
      {locked ? (
        <path d="M5 6V4a2 2 0 0 1 4 0v2" />
      ) : (
        <path d="M5 6V4a2 2 0 0 1 4 0" />
      )}
    </svg>
  )
}

function IconBringToFront() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="4" y="4" width="8" height="8" rx="1" />
      <rect x="2" y="2" width="8" height="8" rx="1" fill="currentColor" fillOpacity="0.15" />
      <path d="M7 6v4M5 8h4" />
    </svg>
  )
}

function IconBringForward() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="4" y="4" width="8" height="8" rx="1" />
      <rect x="2" y="2" width="8" height="8" rx="1" fill="currentColor" fillOpacity="0.15" />
      <path d="M7 6v4" />
    </svg>
  )
}

function IconSendBackward() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="2" y="2" width="8" height="8" rx="1" />
      <rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor" fillOpacity="0.15" />
      <path d="M7 5v4" />
    </svg>
  )
}

function IconSendToBack() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="2" y="2" width="8" height="8" rx="1" />
      <rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor" fillOpacity="0.15" />
      <path d="M7 5v4M5 7h4" />
    </svg>
  )
}

// ── Props ──────────────────────────────────────────────────────────────

export interface SelectionBarProps {
  stagePos: { x: number; y: number }
  stageScale: number
  // Rich text / font props (optional, for Text mode)
  isEditingText?: boolean
  richTextEditor?: Editor | null
  selectedFontFamily?: string
  selectedFontSize?: number
  selectedFontStyle?: FontStyle
  selectedTextAlign?: string
  selectedTextVerticalAlign?: string
  selectedTextColor?: string
  onFontChange?: (updates: { font_family?: string; font_size?: number; font_style?: FontStyle }) => void
  onTextStyleChange?: (updates: { text_align?: string; text_vertical_align?: string; text_color?: string }) => void
  uiDarkMode?: boolean
}

// ── Button style constants ─────────────────────────────────────────────

const BASE_BTN =
  'flex h-9 w-9 items-center justify-center rounded-full transition-colors disabled:opacity-40'
const NORMAL_BTN =
  `${BASE_BTN} text-parchment/80 hover:bg-white/10`
const DELETE_BTN =
  `${BASE_BTN} text-red-400 hover:bg-red-950/30`
const MODE_BTN_ACTIVE =
  `${BASE_BTN} text-parchment bg-white/20`
const MODE_BTN_INACTIVE =
  `${BASE_BTN} text-parchment/60 hover:bg-white/10`

const Divider = () => (
  <div className="w-px h-5 bg-white/20 mx-1" aria-hidden="true" />
)

// ── Component ──────────────────────────────────────────────────────────

export function SelectionBar({
  stagePos,
  stageScale,
  isEditingText,
  richTextEditor,
  selectedFontFamily,
  selectedFontSize,
  selectedFontStyle,
  selectedTextAlign,
  selectedTextVerticalAlign,
  selectedTextColor,
  onFontChange,
  onTextStyleChange,
  uiDarkMode,
}: SelectionBarProps) {
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
    onBringToFront,
    onBringForward,
    onSendBackward,
    onSendToBack,
    onLock,
    onUnlock,
    canLock,
    canUnlock,
  } = useBoardMutations()

  const barRef = useRef<HTMLDivElement>(null)
  const fillInputRef = useRef<HTMLInputElement>(null)
  const strokeInputRef = useRef<HTMLInputElement>(null)
  const textColorInputRef = useRef<HTMLInputElement>(null)

  const [activeMode, setActiveMode] = useState<SelectionMode>(null)

  // ── Position via hook ──────────────────────────────────────────────
  const bbox = useMemo(
    () => selectedIds.size > 0 ? selectionBBox(selectedIds, objects) : null,
    [selectedIds, objects]
  )
  const barPos = useCanvasOverlayPosition(bbox, stagePos, stageScale, barRef)

  // ── Conditional animation: only animate the very first appearance ──
  const barWasVisibleRef = useRef(false)
  const justAppeared = barPos !== null && !barWasVisibleRef.current
  // Update the ref after render (not in an effect, so it's synchronous after paint)
  if (barPos !== null) {
    barWasVisibleRef.current = true
  } else {
    barWasVisibleRef.current = false
  }

  if (selectedIds.size === 0) return null

  // ── Derive per-object properties from the first selected object ───
  const firstId = selectedIds.values().next().value as string | undefined
  const firstObj = firstId ? objects.get(firstId) : undefined

  const fillColor = selectedColor ?? '#5B8DEF'
  const strokeColor = firstObj?.stroke_color ?? '#1B3A6B'
  const opacity = firstObj?.opacity ?? 1
  const textColor = firstObj?.text_color ?? '#000000'

  // ── Feature flags based on selection composition ──────────────────
  const allAreTextType = [...selectedIds].every(id => {
    const obj = objects.get(id)
    return obj ? TEXT_COLOR_TYPES.has(obj.type) : false
  })

  const allAreNoFill = [...selectedIds].every(id => {
    const obj = objects.get(id)
    return obj ? NO_FILL_TYPES.has(obj.type) : false
  })

  // ── Mode toggle handler ───────────────────────────────────────────
  const handleModeToggle = (mode: SelectionMode) => {
    setActiveMode(prev => (prev === mode ? null : mode))
  }

  // ── Arrange: use first selected ID ───────────────────────────────
  const handleBringToFront = () => {
    if (firstId) onBringToFront(firstId)
  }
  const handleBringForward = () => {
    if (firstId) onBringForward(firstId)
  }
  const handleSendBackward = () => {
    if (firstId) onSendBackward(firstId)
  }
  const handleSendToBack = () => {
    if (firstId) onSendToBack(firstId)
  }

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label="Selection properties"
      className={[
        'fixed z-[150]',
        'bg-charcoal/95 dark:bg-[#1E293B]',
        'border border-white/10 rounded-2xl shadow-lg',
        'overflow-hidden',
        justAppeared ? 'animate-[selection-bar-in]' : '',
      ].join(' ')}
      style={barPos ? { top: barPos.top, left: barPos.left } : { visibility: 'hidden' }}
    >
      {/* ── Header row (always visible) ─────────────────────────────── */}
      <div className="px-2 py-1.5 flex items-center gap-1">

        {/* Mode selector: Text */}
        {allAreTextType && (
          <button
            className={activeMode === 'text' ? MODE_BTN_ACTIVE : MODE_BTN_INACTIVE}
            aria-label="Text"
            aria-pressed={activeMode === 'text'}
            onClick={() => handleModeToggle('text')}
            disabled={anySelectedLocked}
            title="Text"
          >
            <IconTextColor color={activeMode === 'text' ? textColor : 'currentColor'} />
          </button>
        )}

        {/* Mode selector: Fill */}
        {!allAreNoFill && (
          <button
            className={activeMode === 'fill' ? MODE_BTN_ACTIVE : MODE_BTN_INACTIVE}
            aria-label="Fill"
            aria-pressed={activeMode === 'fill'}
            onClick={() => handleModeToggle('fill')}
            disabled={anySelectedLocked}
            title="Fill"
          >
            <IconFill color={activeMode === 'fill' ? fillColor : 'currentColor'} />
          </button>
        )}

        {/* Mode selector: Border */}
        <button
          className={activeMode === 'border' ? MODE_BTN_ACTIVE : MODE_BTN_INACTIVE}
          aria-label="Border"
          aria-pressed={activeMode === 'border'}
          onClick={() => handleModeToggle('border')}
          disabled={anySelectedLocked}
          title="Border"
        >
          <IconStroke />
        </button>

        {/* Mode selector: Arrange */}
        <button
          className={activeMode === 'arrange' ? MODE_BTN_ACTIVE : MODE_BTN_INACTIVE}
          aria-label="Arrange"
          aria-pressed={activeMode === 'arrange'}
          onClick={() => handleModeToggle('arrange')}
          title="Arrange"
        >
          <IconArrange />
        </button>

        {/* Mode selector: Lock */}
        <button
          className={activeMode === 'lock' ? MODE_BTN_ACTIVE : MODE_BTN_INACTIVE}
          aria-label="Lock"
          aria-pressed={activeMode === 'lock'}
          onClick={() => handleModeToggle('lock')}
          title="Lock"
        >
          <IconLock locked={anySelectedLocked} />
        </button>

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

      {/* ── Accordion panel ─────────────────────────────────────────── */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${activeMode ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3 pt-1 flex flex-col gap-2">

            {/* Text panel */}
            {activeMode === 'text' && (
              <div className="flex flex-col gap-2">
                {/* Text color */}
                <div className="flex items-center gap-2">
                  <label className="text-xs text-parchment/60 w-16">Text color</label>
                  <input
                    ref={textColorInputRef}
                    type="color"
                    data-testid="text-color-input"
                    className="h-6 w-8 cursor-pointer rounded border border-white/20 bg-transparent p-0"
                    value={textColor}
                    onChange={e => onTextColorChange(e.target.value)}
                    disabled={anySelectedLocked}
                    aria-label="Text color value"
                  />
                </div>
                {/* Rich text toolbar when editing */}
                {RICH_TEXT_ENABLED && isEditingText && richTextEditor && (
                  <RichTextToolbar editor={richTextEditor} dark={uiDarkMode} />
                )}
              </div>
            )}

            {/* Fill panel */}
            {activeMode === 'fill' && (
              <div className="flex flex-col gap-2">
                {/* Fill color */}
                <div className="flex items-center gap-2">
                  <label className="text-xs text-parchment/60 w-16">Fill</label>
                  <input
                    ref={fillInputRef}
                    type="color"
                    data-testid="fill-color-input"
                    className="h-6 w-8 cursor-pointer rounded border border-white/20 bg-transparent p-0"
                    value={fillColor}
                    onChange={e => onColorChange(e.target.value)}
                    disabled={anySelectedLocked || !onColorChange}
                    aria-label="Fill color value"
                  />
                </div>
                {/* Opacity slider */}
                <div className="flex items-center gap-2">
                  <label className="text-xs text-parchment/60 w-16">Opacity</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={opacity}
                    onChange={e => onOpacityChange(parseFloat(e.target.value))}
                    className="w-28 accent-leather"
                    aria-label="Opacity slider"
                    disabled={anySelectedLocked}
                  />
                  <span className="text-xs text-parchment/60 tabular-nums w-8 text-right">
                    {Math.round(opacity * 100)}%
                  </span>
                </div>
              </div>
            )}

            {/* Border panel */}
            {activeMode === 'border' && (
              <div className="flex flex-col gap-2">
                {/* Stroke color */}
                <div className="flex items-center gap-2">
                  <label className="text-xs text-parchment/60 w-16">Color</label>
                  <input
                    ref={strokeInputRef}
                    type="color"
                    data-testid="stroke-color-input"
                    className="h-6 w-8 cursor-pointer rounded border border-white/20 bg-transparent p-0"
                    value={strokeColor}
                    onChange={e => onStrokeStyleChange({ stroke_color: e.target.value })}
                    disabled={anySelectedLocked || !onStrokeStyleChange}
                    aria-label="Stroke color value"
                  />
                </div>
              </div>
            )}

            {/* Arrange panel */}
            {activeMode === 'arrange' && (
              <div className="flex items-center gap-1">
                <button
                  className={NORMAL_BTN}
                  aria-label="Bring to front"
                  onClick={handleBringToFront}
                  disabled={anySelectedLocked}
                  title="Bring to front"
                >
                  <IconBringToFront />
                </button>
                <button
                  className={NORMAL_BTN}
                  aria-label="Bring forward"
                  onClick={handleBringForward}
                  disabled={anySelectedLocked}
                  title="Bring forward"
                >
                  <IconBringForward />
                </button>
                <button
                  className={NORMAL_BTN}
                  aria-label="Send backward"
                  onClick={handleSendBackward}
                  disabled={anySelectedLocked}
                  title="Send backward"
                >
                  <IconSendBackward />
                </button>
                <button
                  className={NORMAL_BTN}
                  aria-label="Send to back"
                  onClick={handleSendToBack}
                  disabled={anySelectedLocked}
                  title="Send to back"
                >
                  <IconSendToBack />
                </button>
              </div>
            )}

            {/* Lock panel */}
            {activeMode === 'lock' && (
              <div className="flex items-center gap-2">
                {canLock && (
                  <button
                    className={NORMAL_BTN}
                    aria-label="Lock selection"
                    onClick={onLock}
                    title="Lock selection"
                  >
                    <IconLock locked={false} />
                    <span className="sr-only">Lock</span>
                  </button>
                )}
                {canUnlock && (
                  <button
                    className={NORMAL_BTN}
                    aria-label="Unlock"
                    onClick={onUnlock}
                    title="Unlock selection"
                  >
                    <IconLock locked={true} />
                    <span className="sr-only">Unlock</span>
                  </button>
                )}
                {!canLock && !canUnlock && (
                  <span className="text-xs text-parchment/40 py-1">
                    Nothing to lock/unlock
                  </span>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
