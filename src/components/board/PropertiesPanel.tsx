'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useBoardContext } from '@/contexts/BoardContext'
import { useBoardMutations } from '@/contexts/BoardMutationsContext'
import { ColorPicker } from '@/components/board/ColorPicker'
import type { FontStyle } from '@/types/board'

// ── Line-type check ───────────────────────────────────────────────────

const LINE_TYPES = new Set(['line', 'arrow', 'data_connector'])

function isLineType(type: string): boolean {
  return LINE_TYPES.has(type)
}

// ── Text-type check ───────────────────────────────────────────────────

const TEXT_TYPES = new Set([
  'sticky_note',
  'text',
  'rectangle',
  'circle',
  'frame',
  'triangle',
  'chevron',
  'parallelogram',
  'ngon',
  'status_badge',
  'section_header',
  'metric_card',
  'checklist',
])

function hasTypography(type: string): boolean {
  return TEXT_TYPES.has(type)
}

// ── Font constants (mirrors FontSelector) ─────────────────────────────

const FONT_FAMILIES = [
  { value: 'sans-serif', label: 'Sans' },
  { value: 'serif', label: 'Serif' },
  { value: 'monospace', label: 'Mono' },
  { value: 'cursive', label: 'Cursive' },
]

const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32]

// ── ChevronDown icon ──────────────────────────────────────────────────

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 4l4 4 4-4" />
    </svg>
  )
}

// ── Section ───────────────────────────────────────────────────────────

interface SectionProps {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}

function Section({ title, open, onToggle, children }: SectionProps) {
  return (
    <div className="border-b border-parchment-border dark:border-white/10">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-charcoal/50 dark:text-parchment/40 hover:text-charcoal dark:hover:text-parchment transition-colors"
        aria-expanded={open}
      >
        {title}
        <ChevronDownIcon className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-4 pb-3 pt-1">{children}</div>}
    </div>
  )
}

// ── ScrubInput ────────────────────────────────────────────────────────

interface ScrubInputProps {
  label: string
  value: number
  onChange: (value: number) => void
  disabled?: boolean
  min?: number
  max?: number
  step?: number
}

function ScrubInput({ label, value, onChange, disabled, min, max, step = 1 }: ScrubInputProps) {
  const startXRef = useRef<number>(0)
  const startValRef = useRef<number>(0)
  const draggingRef = useRef<boolean>(false)

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!draggingRef.current) return
      const delta = e.clientX - startXRef.current
      let next = Math.round(startValRef.current + delta * step)
      if (min !== undefined) next = Math.max(min, next)
      if (max !== undefined) next = Math.min(max, next)
      onChange(next)
    },
    [onChange, min, max, step]
  )

  const handleMouseUp = useCallback(() => {
    draggingRef.current = false
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [handleMouseMove])

  const handleLabelMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return
      e.preventDefault()
      draggingRef.current = true
      startXRef.current = e.clientX
      startValRef.current = value
      document.body.style.cursor = 'ew-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [disabled, value, handleMouseMove, handleMouseUp]
  )

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [handleMouseMove, handleMouseUp])

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`w-5 shrink-0 text-[10px] font-medium select-none ${
          disabled
            ? 'text-charcoal/30 dark:text-parchment/20'
            : 'cursor-ew-resize text-charcoal/50 dark:text-parchment/40 hover:text-charcoal dark:hover:text-parchment'
        }`}
        onMouseDown={handleLabelMouseDown}
        aria-label={`Scrub ${label}`}
      >
        {label}
      </span>
      <input
        type="number"
        value={Math.round(value)}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          const parsed = parseFloat(e.target.value)
          if (!isNaN(parsed)) {
            let clamped = parsed
            if (min !== undefined) clamped = Math.max(min, clamped)
            if (max !== undefined) clamped = Math.min(max, clamped)
            onChange(clamped)
          }
        }}
        className="w-full rounded border px-1.5 py-0.5 text-xs tabular-nums outline-none focus:ring-1 focus:ring-navy disabled:opacity-40 border-parchment-border bg-parchment text-charcoal dark:border-white/10 dark:bg-[#1E293B] dark:text-parchment/80"
        aria-label={label}
      />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────

export function PropertiesPanel() {
  const { selectedIds, objects } = useBoardContext()
  const {
    onColorChange,
    onStrokeStyleChange,
    onOpacityChange,
    onTransformEnd,
    anySelectedLocked,
    selectedColor,
  } = useBoardMutations()

  const [openSections, setOpenSections] = useState({
    positionSize: true,
    fill: true,
    stroke: false,
    opacity: false,
    cornerRadius: false,
    shadow: false,
    typography: false,
  })

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // Derive selected object data
  const firstId = selectedIds.size > 0 ? selectedIds.values().next().value : null
  const firstObj = firstId ? objects.get(firstId) : null

  const x = firstObj?.x ?? 0
  const y = firstObj?.y ?? 0
  const width = firstObj?.width ?? 0
  const height = firstObj?.height ?? 0
  const opacity = firstObj?.opacity ?? 1
  const strokeColor = firstObj?.stroke_color ?? null
  const strokeWidth = firstObj?.stroke_width ?? 1
  const cornerRadius = firstObj?.corner_radius ?? 0
  const shadowColor = firstObj?.shadow_color ?? '#000000'
  const shadowBlur = firstObj?.shadow_blur ?? 0
  const shadowOffsetX = firstObj?.shadow_offset_x ?? 0
  const shadowOffsetY = firstObj?.shadow_offset_y ?? 0

  const fontFamily = firstObj?.font_family ?? 'sans-serif'
  const fontSize = firstObj?.font_size ?? 14
  const fontStyle = firstObj?.font_style ?? 'normal'
  const textAlign = firstObj?.text_align ?? 'center'
  const textVerticalAlign = firstObj?.text_vertical_align ?? 'middle'

  const objType = firstObj?.type ?? 'rectangle'
  const showFill = !isLineType(objType)
  const showCornerRadius = objType === 'rectangle'
  const showTypography = hasTypography(objType)

  const fillColor = selectedColor ?? firstObj?.color ?? '#5B8DEF'

  const isDisabled = anySelectedLocked

  // Derived bold / italic / underline from fontStyle
  const isBold = fontStyle === 'bold' || fontStyle === 'bold italic'
  const isItalic = fontStyle === 'italic' || fontStyle === 'bold italic'

  const handleFontStyleToggle = (toggle: 'bold' | 'italic') => {
    if (!firstId) return
    let next: FontStyle = 'normal'
    if (toggle === 'bold') {
      const nowBold = !isBold
      if (nowBold && isItalic) next = 'bold italic'
      else if (nowBold) next = 'bold'
      else if (isItalic) next = 'italic'
      else next = 'normal'
    } else {
      const nowItalic = !isItalic
      if (isBold && nowItalic) next = 'bold italic'
      else if (isBold) next = 'bold'
      else if (nowItalic) next = 'italic'
      else next = 'normal'
    }
    onTransformEnd(firstId, { font_style: next })
  }

  const btnActive = (active: boolean) =>
    `rounded px-2 py-1 text-xs font-medium transition disabled:opacity-40 ${
      active
        ? 'bg-navy/10 text-navy dark:bg-navy/20 dark:text-navy'
        : 'bg-parchment-dark text-charcoal hover:bg-parchment-border dark:bg-[#1E293B] dark:text-parchment/60 dark:hover:bg-white/15'
    }`

  const labelCls = 'text-[10px] font-medium text-charcoal/50 dark:text-parchment/40 mb-1'

  return (
    <div
      aria-label="Properties panel"
      className="fixed right-0 top-16 h-[calc(100vh-4rem)] w-64 border-l border-white/10 bg-parchment dark:bg-[#111827] z-[150] flex flex-col overflow-y-auto overflow-x-hidden"
      style={{
        transform: selectedIds.size > 0 ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 150ms ease',
      }}
    >
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-parchment-border dark:border-white/10 shrink-0">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-charcoal/50 dark:text-parchment/40">
          Properties
        </span>
        {selectedIds.size > 1 && (
          <span className="text-[10px] text-charcoal/40 dark:text-parchment/30">
            {selectedIds.size} selected
          </span>
        )}
      </div>

      {/* ── Position & Size ─────────────────────────────────────── */}
      <Section
        title="Position & Size"
        open={openSections.positionSize}
        onToggle={() => toggleSection('positionSize')}
      >
        <div className="grid grid-cols-2 gap-x-2 gap-y-2">
          <ScrubInput
            label="X"
            value={x}
            onChange={(v) => firstId && onTransformEnd(firstId, { x: v })}
            disabled={isDisabled}
          />
          <ScrubInput
            label="Y"
            value={y}
            onChange={(v) => firstId && onTransformEnd(firstId, { y: v })}
            disabled={isDisabled}
          />
          <ScrubInput
            label="W"
            value={width}
            onChange={(v) => firstId && onTransformEnd(firstId, { width: v })}
            disabled={isDisabled}
            min={1}
          />
          <ScrubInput
            label="H"
            value={height}
            onChange={(v) => firstId && onTransformEnd(firstId, { height: v })}
            disabled={isDisabled}
            min={1}
          />
        </div>
      </Section>

      {/* ── Fill ───────────────────────────────────────────────── */}
      {showFill && (
        <Section
          title="Fill"
          open={openSections.fill}
          onToggle={() => toggleSection('fill')}
        >
          <ColorPicker
            selectedColor={fillColor}
            onColorChange={onColorChange}
            disabled={isDisabled}
          />
        </Section>
      )}

      {/* ── Stroke ─────────────────────────────────────────────── */}
      <Section
        title="Stroke"
        open={openSections.stroke}
        onToggle={() => toggleSection('stroke')}
      >
        <div className="space-y-2">
          <div>
            <div className={labelCls}>Color</div>
            <ColorPicker
              selectedColor={strokeColor ?? '#1B3A6B'}
              onColorChange={(color) => onStrokeStyleChange({ stroke_color: color })}
              disabled={isDisabled}
              compact
              label="Stroke color"
            />
          </div>
          <ScrubInput
            label="W"
            value={strokeWidth}
            onChange={(v) => onStrokeStyleChange({ stroke_width: v })}
            disabled={isDisabled}
            min={0}
            max={20}
          />
        </div>
      </Section>

      {/* ── Opacity ────────────────────────────────────────────── */}
      <Section
        title="Opacity"
        open={openSections.opacity}
        onToggle={() => toggleSection('opacity')}
      >
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className={labelCls}>Value</span>
            <span className="text-xs tabular-nums text-charcoal/60 dark:text-parchment/50">
              {Math.round(opacity * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={Math.round(opacity * 100)}
            disabled={isDisabled}
            onChange={(e) => onOpacityChange(parseInt(e.target.value, 10) / 100)}
            className="w-full accent-navy disabled:opacity-40"
            aria-label="Opacity"
          />
        </div>
      </Section>

      {/* ── Corner Radius (rectangles only) ────────────────────── */}
      {showCornerRadius && (
        <Section
          title="Corner Radius"
          open={openSections.cornerRadius}
          onToggle={() => toggleSection('cornerRadius')}
        >
          <ScrubInput
            label="R"
            value={cornerRadius}
            onChange={(v) => firstId && onTransformEnd(firstId, { corner_radius: v })}
            disabled={isDisabled}
            min={0}
            max={100}
          />
        </Section>
      )}

      {/* ── Shadow ─────────────────────────────────────────────── */}
      <Section
        title="Shadow"
        open={openSections.shadow}
        onToggle={() => toggleSection('shadow')}
      >
        <div className="space-y-2">
          <div>
            <div className={labelCls}>Color</div>
            <ColorPicker
              selectedColor={shadowColor}
              onColorChange={(color) =>
                firstId && onTransformEnd(firstId, { shadow_color: color })
              }
              disabled={isDisabled}
              compact
              label="Shadow color"
            />
          </div>
          <ScrubInput
            label="B"
            value={shadowBlur}
            onChange={(v) => firstId && onTransformEnd(firstId, { shadow_blur: v })}
            disabled={isDisabled}
            min={0}
            max={100}
          />
          <div className="grid grid-cols-2 gap-x-2">
            <ScrubInput
              label="X"
              value={shadowOffsetX}
              onChange={(v) => firstId && onTransformEnd(firstId, { shadow_offset_x: v })}
              disabled={isDisabled}
            />
            <ScrubInput
              label="Y"
              value={shadowOffsetY}
              onChange={(v) => firstId && onTransformEnd(firstId, { shadow_offset_y: v })}
              disabled={isDisabled}
            />
          </div>
        </div>
      </Section>

      {/* ── Typography ─────────────────────────────────────────── */}
      {showTypography && (
        <Section
          title="Typography"
          open={openSections.typography}
          onToggle={() => toggleSection('typography')}
        >
          <div className="space-y-3">
            {/* Font family */}
            <div>
              <div className={labelCls}>Font</div>
              <select
                value={fontFamily}
                disabled={isDisabled}
                onChange={(e) => firstId && onTransformEnd(firstId, { font_family: e.target.value })}
                className="w-full rounded border px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-navy disabled:opacity-40 border-parchment-border bg-parchment text-charcoal dark:border-white/10 dark:bg-[#1E293B] dark:text-parchment/80"
                aria-label="Font family"
              >
                {FONT_FAMILIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Font size */}
            <div>
              <div className={labelCls}>Size</div>
              <div className="flex flex-wrap gap-1">
                {FONT_SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => firstId && onTransformEnd(firstId, { font_size: size })}
                    className={btnActive(fontSize === size)}
                    aria-label={`Font size ${size}`}
                    aria-pressed={fontSize === size}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Bold / Italic */}
            <div>
              <div className={labelCls}>Style</div>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={isDisabled}
                  onClick={() => handleFontStyleToggle('bold')}
                  className={btnActive(isBold)}
                  style={{ fontWeight: 'bold' }}
                  aria-label="Bold"
                  aria-pressed={isBold}
                >
                  B
                </button>
                <button
                  type="button"
                  disabled={isDisabled}
                  onClick={() => handleFontStyleToggle('italic')}
                  className={btnActive(isItalic)}
                  style={{ fontStyle: 'italic' }}
                  aria-label="Italic"
                  aria-pressed={isItalic}
                >
                  I
                </button>
              </div>
            </div>

            {/* Text alignment */}
            <div>
              <div className={labelCls}>Align</div>
              <div className="flex gap-1">
                {(['left', 'center', 'right'] as const).map((align) => (
                  <button
                    key={align}
                    type="button"
                    disabled={isDisabled}
                    onClick={() =>
                      firstId && onTransformEnd(firstId, { text_align: align })
                    }
                    className={`flex-1 ${btnActive(textAlign === align)}`}
                    aria-label={`Align ${align}`}
                    aria-pressed={textAlign === align}
                  >
                    {align.charAt(0).toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Vertical alignment */}
            <div>
              <div className={labelCls}>Vertical</div>
              <div className="flex gap-1">
                {(['top', 'middle', 'bottom'] as const).map((valign) => (
                  <button
                    key={valign}
                    type="button"
                    disabled={isDisabled}
                    onClick={() =>
                      firstId && onTransformEnd(firstId, { text_vertical_align: valign })
                    }
                    className={`flex-1 ${btnActive(textVerticalAlign === valign)}`}
                    aria-label={`Align ${valign}`}
                    aria-pressed={textVerticalAlign === valign}
                  >
                    {valign.charAt(0).toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Section>
      )}
    </div>
  )
}
