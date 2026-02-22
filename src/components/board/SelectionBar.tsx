'use client'

import React, { useRef, useState, useMemo, useEffect, useLayoutEffect, useCallback } from 'react'
import { useBoardContext } from '@/contexts/BoardContext'
import { useBoardMutations } from '@/contexts/BoardMutationsContext'
import { selectionBBox } from '@/lib/geometry/bbox'
import { useCanvasOverlayPosition } from '@/hooks/board/useCanvasOverlayPosition'
import { RICH_TEXT_ENABLED } from '@/lib/richText'
import {
  readActiveState,
  EMPTY_ACTIVE,
  RichFontControls,
  RichBtn,
} from './RichTextToolbar'
import type { ActiveState } from './RichTextToolbar'
import { MarkerIcon, MARKER_TYPES } from './lineMarkers'
import type { MarkerType } from './lineMarkers'
import type { Editor } from '@tiptap/react'

// ── Types that show the Text button (full rich text) ────────────────────
// Excludes sticky_note, frame, and table/card types per design spec
const RICH_TEXT_TYPES = new Set([
  'text',
  'rectangle',
  'circle',
  'triangle',
  'chevron',
  'parallelogram',
  'ngon',
])

// ── Vector types with no fill color ──────────────────────────────────
const NO_FILL_TYPES = new Set(['line', 'arrow', 'data_connector'])

// ── Active group ─────────────────────────────────────────────────────
type ActiveGroup = 'text' | 'format' | null

// ── Color palette presets ────────────────────────────────────────────
const COLOR_PRESETS = [
  '#ffffff', '#000000', '#6b7280',
  '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#06b6d4', '#3b82f6',
  '#8b5cf6', '#ec4899',
]

// ── Stroke presets ───────────────────────────────────────────────────
const STROKE_DASH_PRESETS: { label: string; value: string; dasharray: string }[] = [
  { label: 'Solid', value: '', dasharray: 'none' },
  { label: 'Dashed', value: '[8,4]', dasharray: '8,4' },
  { label: 'Dashed loose', value: '[12,6]', dasharray: '12,6' },
  { label: 'Dotted', value: '[2,4]', dasharray: '2,4' },
  { label: 'Dot-dash', value: '[2,4,8,4]', dasharray: '2,4,8,4' },
  { label: 'Long dash', value: '[16,6]', dasharray: '16,6' },
]

// ── Style constants ──────────────────────────────────────────────────
const PILL_SHADOW = '0 4px 16px rgba(0,0,0,0.45), 0 1px 4px rgba(0,0,0,0.3)'
const SPRING = 'cubic-bezier(.34,1.56,.64,1)'

// ── Icon SVGs ────────────────────────────────────────────────────────

function IconTextColor({ color }: { color: string }) {
  return (
    <svg className="h-6 w-6" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <text x="7" y="10" textAnchor="middle" fontSize="10" fontWeight="700" fontFamily="system-ui, sans-serif" fill="currentColor">T</text>
      <rect x="1" y="11.5" width="12" height="1.5" rx="0.75" fill={color} />
    </svg>
  )
}

function IconShapeFormat({ fillColor, strokeColor }: { fillColor: string; strokeColor: string }) {
  return (
    <svg className="h-6 w-6" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="5" cy="8" r="4" fill={fillColor} fillOpacity="0.5" stroke={strokeColor} strokeWidth="1" />
      <rect x="5" y="2" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}



// ── Color circle (inline color picker as a circle button) ────────────

function ColorCircle({
  color, onChange, label, disabled, testId, style, compact,
}: {
  color: string
  onChange: (c: string) => void
  label: string
  disabled?: boolean
  testId?: string
  style?: React.CSSProperties
  compact?: boolean
}) {
  // Local state so the swatch updates immediately while dragging;
  // the parent onChange is debounced to avoid flooding mutations/broadcasts.
  const [localColor, setLocalColor] = useState(color)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync if parent resets the color (e.g. selection change)
  useEffect(() => { setLocalColor(color) }, [color])

  const handleChange = useCallback((c: string) => {
    setLocalColor(c)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => onChange(c), 80)
  }, [onChange])

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  if (compact) {
    return (
      <div
        className="relative h-6 w-6 shrink-0 rounded-full"
        title={label}
        style={style}
      >
        <div
          className={`h-full w-full rounded-full border-2 border-dashed transition-colors ${disabled ? 'opacity-40' : ''}`}
          style={{ backgroundColor: localColor, borderColor: 'rgba(255,255,255,0.4)', boxShadow: PILL_SHADOW }}
        />
        <input
          type="color"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          value={localColor}
          onChange={e => handleChange(e.target.value)}
          disabled={disabled}
          aria-label={`${label} value`}
          data-testid={testId}
        />
      </div>
    )
  }
  return (
    <div
      className="relative h-10 w-10 shrink-0 rounded-full"
      title={label}
      style={style}
    >
      <div className={`flex items-center justify-center h-full w-full rounded-full border bg-navy ${disabled ? 'border-navy/40 opacity-40' : 'border-navy/40 hover:border-parchment-border'}`}>
        <div className="h-5 w-5 rounded-full border border-white/20" style={{ backgroundColor: localColor }} />
      </div>
      <input
        type="color"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        value={localColor}
        onChange={e => handleChange(e.target.value)}
        disabled={disabled}
        aria-label={`${label} value`}
        data-testid={testId}
      />
    </div>
  )
}

// ── Props ────────────────────────────────────────────────────────────

export interface SelectionBarProps {
  stagePos: { x: number; y: number }
  stageScale: number
  isEditingText?: boolean
  richTextEditor?: Editor | null
  uiDarkMode?: boolean
}

// ── Stagger helpers ──────────────────────────────────────────────────

function childStyle(revealed: boolean, i: number): React.CSSProperties {
  return {
    opacity: revealed ? 1 : 0,
    transform: revealed ? 'scale(1)' : 'scale(0.3)',
    boxShadow: PILL_SHADOW,
    transition: `opacity 140ms ${SPRING} ${i * 25}ms, transform 140ms ${SPRING} ${i * 25}ms`,
  }
}

// ── Component ────────────────────────────────────────────────────────

export function SelectionBar({
  stagePos,
  stageScale,
  isEditingText,
  richTextEditor,
  uiDarkMode,
}: SelectionBarProps) {
  const { selectedIds, objects } = useBoardContext()
  const {
    selectedColor,
    onColorChange,
    onTextColorChange,
    anySelectedLocked,
    onStrokeStyleChange,
    onOpacityChange,
    onMarkerChange,
  } = useBoardMutations()

  const barRef = useRef<HTMLDivElement>(null)

  const [activeGroup, setActiveGroup] = useState<ActiveGroup>(null)
  const [activeSub, setActiveSub] = useState<string | null>(null)

  // ── Stagger animation state ─────────────────────────────────────────
  const [buttonsRevealed, setButtonsRevealed] = useState(false)
  const [childRevealed, setChildRevealed] = useState(false)
  const [childRevealGen, setChildRevealGen] = useState(0)
  const [subRevealed, setSubRevealed] = useState(false)
  const [subRevealGen, setSubRevealGen] = useState(0)
  const raf2Ref = useRef(0)
  const rafSubRef = useRef(0)

  // Animate group buttons on mount
  useEffect(() => {
    const raf1 = requestAnimationFrame(() => {
      raf2Ref.current = requestAnimationFrame(() => setButtonsRevealed(true))
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2Ref.current)
    }
  }, [])

  // Animate fan-out children when activeGroup changes
  useEffect(() => {
    if (!activeGroup) return
    setChildRevealed(false)
    setChildRevealGen(g => g + 1)
    setActiveSub(null)
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => setChildRevealed(true))
      raf2Ref.current = raf2
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2Ref.current)
    }
  }, [activeGroup])

  // Animate sub-sub menu when activeSub changes
  useEffect(() => {
    if (!activeSub) return
    setSubRevealed(false)
    setSubRevealGen(g => g + 1)
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => setSubRevealed(true))
      rafSubRef.current = raf2
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(rafSubRef.current)
    }
  }, [activeSub])

  // ── Rich text active state tracking ──────────────────────────────────
  const [richActive, setRichActive] = useState<ActiveState>(EMPTY_ACTIVE)
  const [fontSizeInput, setFontSizeInput] = useState('')

  useEffect(() => {
    if (!richTextEditor || richTextEditor.isDestroyed || !isEditingText) {
      setRichActive(EMPTY_ACTIVE)
      setFontSizeInput('')
      return
    }
    const handler = () => {
      const state = readActiveState(richTextEditor)
      setRichActive(state)
      setFontSizeInput(state.fontSize ? state.fontSize.replace('px', '') : '')
    }
    handler()
    richTextEditor.on('selectionUpdate', handler)
    richTextEditor.on('transaction', handler)
    return () => {
      richTextEditor.off('selectionUpdate', handler)
      richTextEditor.off('transaction', handler)
    }
  }, [richTextEditor, isEditingText])

  const richRun = useCallback((cmd: (e: Editor) => void) => {
    if (!richTextEditor || richTextEditor.isDestroyed) return
    cmd(richTextEditor)
  }, [richTextEditor])

  const richApplyFontSize = useCallback((value: string) => {
    if (!richTextEditor || richTextEditor.isDestroyed) return
    const px = parseInt(value, 10)
    if (!isNaN(px) && px > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(richTextEditor.chain().focus() as any).setFontSize(`${px}px`).run()
    }
  }, [richTextEditor])

  // Collapse menu when selection changes
  useEffect(() => {
    setActiveGroup(null)
    setActiveSub(null)
  }, [selectedIds])

  // Auto-open the Text group when entering text editing mode
  useEffect(() => {
    if (isEditingText && RICH_TEXT_ENABLED) {
      setActiveGroup('text')
    }
  }, [isEditingText])

  // ── Position via hook ──────────────────────────────────────────────
  const bbox = useMemo(
    () => selectedIds.size > 0 ? selectionBBox(selectedIds, objects) : null,
    [selectedIds, objects]
  )
  const barPos = useCanvasOverlayPosition(bbox, stagePos, stageScale, barRef, {
    extraDeps: [activeGroup],
  })

  // ── Conditional animation: only animate the very first appearance ──
  const barWasVisibleRef = useRef(false)
  const justAppeared = barPos !== null && !barWasVisibleRef.current
  useLayoutEffect(() => {
    barWasVisibleRef.current = barPos !== null
  })

  if (selectedIds.size === 0) return null

  // ── Derive per-object properties from the first selected object ───
  const firstId = selectedIds.values().next().value as string | undefined
  const firstObj = firstId ? objects.get(firstId) : undefined

  const fillColor = selectedColor ?? '#5B8DEF'
  const strokeColor = firstObj?.stroke_color ?? firstObj?.color ?? '#5B8DEF'
  const strokeWidth = firstObj?.stroke_width ?? 2
  const strokeDash = firstObj?.stroke_dash ?? ''
  const opacity = firstObj?.opacity ?? 1
  const textColor = firstObj?.text_color ?? '#000000'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerStart: MarkerType = (firstObj as any)?.marker_start ?? 'none'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerEnd: MarkerType = (firstObj as any)?.marker_end ?? 'none'

  // ── Feature flags based on selection composition ──────────────────
  const allAreRichTextType = [...selectedIds].every(id => {
    const obj = objects.get(id)
    return obj ? RICH_TEXT_TYPES.has(obj.type) : false
  })

  const allAreNoFill = [...selectedIds].every(id => {
    const obj = objects.get(id)
    return obj ? NO_FILL_TYPES.has(obj.type) : false
  })

  // ── Toggle handlers ────────────────────────────────────────────────
  const handleGroupToggle = (group: ActiveGroup) => {
    setActiveGroup(prev => (prev === group ? null : group))
  }

  const handleSubToggle = (sub: string) => {
    setActiveSub(prev => (prev === sub ? null : sub))
  }

  // ── Group pill helpers ─────────────────────────────────────────────
  const hasActiveGroup = activeGroup !== null
  const groupPillStyle = (group: ActiveGroup, i: number): React.CSSProperties => {
    const isActive = activeGroup === group
    let scale = buttonsRevealed ? 1 : 0.3
    if (buttonsRevealed && hasActiveGroup && !isActive) scale = 0.85
    return {
      opacity: buttonsRevealed ? (hasActiveGroup && !isActive ? 0.45 : 1) : 0,
      transform: `scale(${scale})`,
      boxShadow: PILL_SHADOW,
      transition: `opacity 140ms ${SPRING} ${i * 25}ms, transform 140ms ${SPRING} ${i * 25}ms, background-color 150ms, border-color 150ms`,
    }
  }

  const groupPillCls = (group: ActiveGroup) =>
    `flex h-14 w-14 flex-col items-center justify-center rounded-full border transition-colors disabled:opacity-40 ${
      activeGroup === group
        ? 'bg-navy border-leather text-parchment'
        : 'bg-navy border-navy/40 text-parchment/80 hover:border-parchment-border hover:text-parchment'
    }`

  // ── Sub-group pill helpers ──────────────────────────────────────────
  const hasActiveSub = activeSub !== null
  const subPillCls = (sub: string) =>
    `flex h-12 w-12 flex-col items-center justify-center rounded-full border transition-colors disabled:opacity-40 ${
      activeSub === sub
        ? 'bg-navy border-leather text-parchment'
        : 'bg-navy border-navy/40 text-parchment/80 hover:border-parchment-border hover:text-parchment'
    }`

  const subPillStyle = (sub: string, i: number): React.CSSProperties => {
    const isActive = activeSub === sub
    let scale = childRevealed ? 1 : 0.3
    if (childRevealed && hasActiveSub && !isActive) scale = 0.85
    return {
      opacity: childRevealed ? (hasActiveSub && !isActive ? 0.45 : 1) : 0,
      transform: `scale(${scale})`,
      boxShadow: PILL_SHADOW,
      transition: `opacity 140ms ${SPRING} ${i * 25}ms, transform 140ms ${SPRING} ${i * 25}ms, background-color 150ms, border-color 150ms`,
    }
  }

  // Vertical stagger for sub-sub dropdown items (no shadow — applied per-element)
  function vertStyle(i: number): React.CSSProperties {
    return {
      opacity: subRevealed ? 1 : 0,
      transform: subRevealed ? 'scale(1) translateY(0)' : 'scale(0.3) translateY(-8px)',
      transition: `opacity 140ms ${SPRING} ${i * 25}ms, transform 140ms ${SPRING} ${i * 25}ms`,
    }
  }

  let btnIdx = 0

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label="Selection properties"
      className={[
        'fixed z-[150]',
        justAppeared ? 'animate-[selection-bar-in]' : '',
      ].join(' ')}
      style={barPos ? { top: barPos.top, left: barPos.left } : { visibility: 'hidden' }}
    >
      {/* ── Row 1: Main group buttons ───────────────────────────────── */}
      <div className="flex items-center gap-2 py-1">

        {/* Text group button */}
        {allAreRichTextType && (
          <button
            className={groupPillCls('text')}
            aria-label="Text"
            aria-pressed={activeGroup === 'text'}
            onClick={() => handleGroupToggle('text')}
            disabled={anySelectedLocked}
            title="Text"
            style={groupPillStyle('text', btnIdx++)}
          >
            <IconTextColor color={activeGroup === 'text' ? textColor : 'currentColor'} />
            <span className="text-[11px] mt-0.5 leading-tight">Text</span>
          </button>
        )}

        {/* Shape Format group button */}
        <button
          className={groupPillCls('format')}
          aria-label="Shape Format"
          aria-pressed={activeGroup === 'format'}
          onClick={() => handleGroupToggle('format')}
          disabled={anySelectedLocked}
          title="Shape Format"
          style={groupPillStyle('format', btnIdx++)}
        >
          <IconShapeFormat fillColor={fillColor} strokeColor={strokeColor} />
          <span className="text-[11px] mt-0.5 leading-tight">Style</span>
        </button>

      </div>

      {/* ── Row 2: Sub-group buttons (drops below main row) ──────────── */}
      {activeGroup && (
        <div className="flex items-start gap-1.5 mt-1 py-1" data-testid="fan-out-row">

          {/* ── Text sub-groups ─────────────────────────────────────── */}
          {activeGroup === 'text' && (() => {
            const subs = [
              { id: 'txt-color', label: 'Color', icon: 'M7 2v11m4-11v11M5 4h8m-9 4h8' },
              ...(RICH_TEXT_ENABLED ? [
                { id: 'txt-font', label: 'Font', icon: 'M4 7V4h16v3M9 20h6M12 4v16' },
                { id: 'txt-format', label: 'Format', icon: 'M6 4v16M6 4h8a4 4 0 010 8H6m0 0h9a4 4 0 010 8H6' },
                { id: 'txt-heading', label: 'Heading', icon: 'M4 12h16M4 4v16M20 4v16' },
                { id: 'txt-list', label: 'Lists', icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' },
                { id: 'txt-align', label: 'Align', icon: 'M3 6h18M3 10h12M3 14h18M3 18h12' },
              ] : []),
            ]
            let idx = 0
            return subs.map(sub => (
              <div key={`${childRevealGen}-${sub.id}`} className="relative flex flex-col items-center">
                <button
                  className={subPillCls(sub.id)}
                  aria-label={sub.label}
                  onClick={() => handleSubToggle(sub.id)}
                  disabled={anySelectedLocked}
                  title={sub.label}
                  style={subPillStyle(sub.id, idx++)}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={sub.icon} />
                  </svg>
                  <span className="text-[9px] mt-0.5 leading-tight">{sub.label}</span>
                </button>

                {/* Vertical dropdown */}
                {activeSub === sub.id && (
                  <div className="absolute top-full mt-1 flex flex-col items-center gap-1.5 z-10" data-testid={`sub-dropdown-${sub.id}`}>
                    {sub.id === 'txt-color' && (() => {
                      let vi2 = 0
                      return (
                        <>
                          <ColorCircle
                            key={`${subRevealGen}-tc`}
                            color={textColor}
                            onChange={onTextColorChange}
                            label="Text color"
                            disabled={anySelectedLocked}
                            testId="text-color-input"
                            style={vertStyle(vi2++)}
                          />
                          {RICH_TEXT_ENABLED && (
                            <div key={`${subRevealGen}-hl`} onMouseDown={e => { e.preventDefault(); e.stopPropagation() }} style={vertStyle(vi2++)}>
                              <RichBtn
                                label="Highlight"
                                isActive={richActive.highlight}
                                onClick={() => richRun(e => e.chain().focus().toggleHighlight().run())}
                                pillStyle={richActive.highlight ? { backgroundColor: '#fef08a', color: '#1c1c1e' } : undefined}
                              >H</RichBtn>
                            </div>
                          )}
                        </>
                      )
                    })()}

                    {sub.id === 'txt-font' && (
                      <div key={`${subRevealGen}-font`} className="flex flex-col gap-1.5" onMouseDown={e => e.preventDefault()}>
                        <RichFontControls
                          editor={richTextEditor ?? null}
                          active={richActive}
                          run={richRun}
                          applyFontSize={richApplyFontSize}
                          fontSizeInput={fontSizeInput}
                          setFontSizeInput={setFontSizeInput}
                          revealed={subRevealed}
                          vertical
                        />
                      </div>
                    )}

                    {sub.id === 'txt-format' && (() => {
                      let vi2 = 0
                      const fmts = [
                        { label: 'Bold (⌘B)', key: 'bold', style: { fontWeight: 'bold' } as React.CSSProperties, cmd: (e: Editor) => e.chain().focus().toggleBold().run() },
                        { label: 'Italic (⌘I)', key: 'italic', style: { fontStyle: 'italic' } as React.CSSProperties, cmd: (e: Editor) => e.chain().focus().toggleItalic().run() },
                        { label: 'Underline (⌘U)', key: 'underline', style: { textDecoration: 'underline' } as React.CSSProperties, cmd: (e: Editor) => e.chain().focus().toggleUnderline().run() },
                        { label: 'Strikethrough', key: 'strike', style: { textDecoration: 'line-through' } as React.CSSProperties, cmd: (e: Editor) => e.chain().focus().toggleStrike().run() },
                      ] as const
                      return fmts.map(f => (
                        <RichBtn
                          key={`${subRevealGen}-${f.key}`}
                          label={f.label}
                          isActive={richActive[f.key]}
                          onClick={() => richRun(f.cmd)}
                          style={f.style}
                          pillStyle={vertStyle(vi2++)}
                        >{f.key[0].toUpperCase()}</RichBtn>
                      ))
                    })()}

                    {sub.id === 'txt-heading' && (() => {
                      let vi2 = 0
                      const headings = [
                        { label: 'Heading 1', key: 'h1' as const, text: 'H1', cmd: (e: Editor) => e.chain().focus().toggleHeading({ level: 1 }).run() },
                        { label: 'Heading 2', key: 'h2' as const, text: 'H2', cmd: (e: Editor) => e.chain().focus().toggleHeading({ level: 2 }).run() },
                        { label: 'Heading 3', key: 'h3' as const, text: 'H3', cmd: (e: Editor) => e.chain().focus().toggleHeading({ level: 3 }).run() },
                      ] as const
                      return headings.map(h => (
                        <RichBtn
                          key={`${subRevealGen}-${h.key}`}
                          label={h.label}
                          isActive={richActive[h.key]}
                          onClick={() => richRun(h.cmd)}
                          pillStyle={vertStyle(vi2++)}
                        >{h.text}</RichBtn>
                      ))
                    })()}

                    {sub.id === 'txt-list' && (() => {
                      let vi2 = 0
                      const lists = [
                        { label: 'Bullet list', key: 'bulletList' as const, icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', cmd: (e: Editor) => e.chain().focus().toggleBulletList().run() },
                        { label: 'Numbered list', key: 'orderedList' as const, icon: 'M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2', cmd: (e: Editor) => e.chain().focus().toggleOrderedList().run() },
                        { label: 'Checklist', key: 'taskList' as const, icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11', cmd: (e: Editor) => e.chain().focus().toggleTaskList().run() },
                      ] as const
                      return lists.map(l => (
                        <RichBtn
                          key={`${subRevealGen}-${l.key}`}
                          label={l.label}
                          isActive={richActive[l.key]}
                          onClick={() => richRun(l.cmd)}
                          pillStyle={vertStyle(vi2++)}
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d={l.icon} /></svg>
                        </RichBtn>
                      ))
                    })()}

                    {sub.id === 'txt-align' && (() => {
                      let vi2 = 0
                      const aligns = [
                        { label: 'Align left', value: 'left' as const, icon: 'M3 6h18M3 10h12M3 14h18M3 18h12' },
                        { label: 'Align center', value: 'center' as const, icon: 'M3 6h18M6 10h12M3 14h18M6 18h12' },
                        { label: 'Align right', value: 'right' as const, icon: 'M3 6h18M9 10h12M3 14h18M9 18h12' },
                      ] as const
                      return aligns.map(a => (
                        <RichBtn
                          key={`${subRevealGen}-align-${a.value}`}
                          label={a.label}
                          isActive={richActive.textAlign === a.value}
                          onClick={() => richRun(e => e.chain().focus().setTextAlign(a.value).run())}
                          pillStyle={vertStyle(vi2++)}
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d={a.icon} /></svg>
                        </RichBtn>
                      ))
                    })()}
                  </div>
                )}
              </div>
            ))
          })()}

          {/* ── Shape Format sub-groups ─────────────────────────────── */}
          {activeGroup === 'format' && (() => {
            // Lines/vectors: Color, Weight, Dash, Start, End as peer sub-groups
            // Shapes: Fill, Border
            const subs = allAreNoFill
              ? [
                  { id: 'fmt-color',  label: 'Color',  icon: 'M12 2a10 10 0 100 20 10 10 0 000-20z' },
                  { id: 'fmt-weight', label: 'Weight', icon: 'M3 12h18' },
                  { id: 'fmt-dash',   label: 'Dash',   icon: 'M5 12h3M10 12h4M18 12h3' },
                  { id: 'fmt-start',  label: 'Start',  icon: 'M5 12h14M5 12l4-4M5 12l4 4' },
                  { id: 'fmt-end',    label: 'End',    icon: 'M19 12H5M19 12l-4-4M19 12l-4 4' },
                ]
              : [
                  { id: 'fmt-fill',   label: 'Fill',   icon: 'M12 2a10 10 0 100 20 10 10 0 000-20z' },
                  { id: 'fmt-color',  label: 'Color',  icon: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z' },
                  { id: 'fmt-weight', label: 'Weight', icon: 'M3 12h18' },
                  { id: 'fmt-dash',   label: 'Dash',   icon: 'M5 12h3M10 12h4M18 12h3' },
                ]

            let idx = 0
            return subs.map(sub => (
              <div key={`${childRevealGen}-${sub.id}`} className="relative flex flex-col items-center">
                <button
                  className={subPillCls(sub.id)}
                  aria-label={sub.label}
                  onClick={() => handleSubToggle(sub.id)}
                  disabled={anySelectedLocked}
                  title={sub.label}
                  style={subPillStyle(sub.id, idx++)}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={sub.icon} />
                  </svg>
                  <span className="text-[9px] mt-0.5 leading-tight">{sub.label}</span>
                </button>

                {/* Vertical dropdown */}
                {activeSub === sub.id && (
                  <div className="absolute top-full mt-1 flex flex-col items-center gap-1.5 z-10" data-testid={`sub-dropdown-${sub.id}`}>

                    {/* ── Fill: 4×3 grid (custom picker top-left) + opacity ─── */}
                    {sub.id === 'fmt-fill' && (() => {
                      let vi = 0
                      // 4×3 grid: custom picker in [0,0], then 11 presets fill the rest
                      const fillRows: (string | null)[][] = [
                        [null, COLOR_PRESETS[0], COLOR_PRESETS[1], COLOR_PRESETS[2]],
                        [COLOR_PRESETS[3], COLOR_PRESETS[4], COLOR_PRESETS[5], COLOR_PRESETS[6]],
                        [COLOR_PRESETS[7], COLOR_PRESETS[8], COLOR_PRESETS[9], COLOR_PRESETS[10]],
                      ]
                      return (
                        <>
                          <div key={`${subRevealGen}-fill-presets`} className="flex flex-col gap-1" style={vertStyle(vi++)}>
                            {fillRows.map((row, ri) => (
                              <div key={ri} className="flex gap-1">
                                {row.map((c, ci) => c === null ? (
                                  <ColorCircle
                                    key="custom"
                                    compact
                                    color={fillColor}
                                    onChange={onColorChange}
                                    label="Custom fill color"
                                    disabled={anySelectedLocked || !onColorChange}
                                    testId="fill-color-input"
                                  />
                                ) : (
                                  <button
                                    key={c}
                                    className={`h-6 w-6 rounded-full border-2 transition-colors ${fillColor.toLowerCase() === c ? 'border-leather scale-110' : 'border-transparent hover:border-parchment-border'}`}
                                    style={{ backgroundColor: c, boxShadow: PILL_SHADOW }}
                                    title={c}
                                    onClick={() => onColorChange(c)}
                                    disabled={anySelectedLocked || !onColorChange}
                                    aria-label={`Fill color ${c}`}
                                  />
                                ))}
                              </div>
                            ))}
                          </div>
                          <div key={`${subRevealGen}-opa`} className="flex flex-col items-center gap-1" style={vertStyle(vi++)}>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.01"
                              value={opacity}
                              onChange={e => onOpacityChange(parseFloat(e.target.value))}
                              className="w-24 accent-leather"
                              aria-label="Opacity"
                              disabled={anySelectedLocked}
                            />
                            <span className="text-[10px] text-parchment/60 tabular-nums">
                              Opacity {Math.round(opacity * 100)}%
                            </span>
                          </div>
                        </>
                      )
                    })()}

                    {/* ── Stroke color: 4×3 grid (custom picker top-left) ─── */}
                    {sub.id === 'fmt-color' && (() => {
                      let vi = 0
                      const colorRows: (string | null)[][] = [
                        [null, COLOR_PRESETS[0], COLOR_PRESETS[1], COLOR_PRESETS[2]],
                        [COLOR_PRESETS[3], COLOR_PRESETS[4], COLOR_PRESETS[5], COLOR_PRESETS[6]],
                        [COLOR_PRESETS[7], COLOR_PRESETS[8], COLOR_PRESETS[9], COLOR_PRESETS[10]],
                      ]
                      return (
                        <>
                          <div key={`${subRevealGen}-lc-presets`} className="flex flex-col gap-1" style={vertStyle(vi++)}>
                            {colorRows.map((row, ri) => (
                              <div key={ri} className="flex gap-1">
                                {row.map((c, ci) => c === null ? (
                                  <ColorCircle
                                    key="custom"
                                    compact
                                    color={strokeColor}
                                    onChange={c => onStrokeStyleChange({ stroke_color: c })}
                                    label="Custom stroke color"
                                    disabled={anySelectedLocked}
                                    testId="stroke-color-input"
                                  />
                                ) : (
                                  <button
                                    key={c}
                                    className={`h-6 w-6 rounded-full border-2 transition-colors ${strokeColor.toLowerCase() === c ? 'border-leather scale-110' : 'border-transparent hover:border-parchment-border'}`}
                                    style={{ backgroundColor: c, boxShadow: PILL_SHADOW }}
                                    title={c}
                                    onClick={() => onStrokeStyleChange({ stroke_color: c })}
                                    disabled={anySelectedLocked}
                                    aria-label={`Stroke color ${c}`}
                                  />
                                ))}
                              </div>
                            ))}
                          </div>
                        </>
                      )
                    })()}

                    {/* ── Line Weight: slider ───────────────────────── */}
                    {sub.id === 'fmt-weight' && (
                      <div key={`${subRevealGen}-lw`} className="flex flex-col items-center gap-1" style={vertStyle(0)}>
                        <input
                          type="range"
                          min="1"
                          max="20"
                          step="1"
                          value={strokeWidth}
                          onChange={e => onStrokeStyleChange({ stroke_width: parseInt(e.target.value, 10) })}
                          className="w-24 accent-leather"
                          aria-label="Line weight"
                          disabled={anySelectedLocked}
                        />
                        <span className="text-[10px] text-parchment/60 tabular-nums">
                          Weight {strokeWidth}px
                        </span>
                      </div>
                    )}

                    {/* ── Line Dash: dash presets ───────────────────── */}
                    {sub.id === 'fmt-dash' && (() => {
                      let vi = 0
                      return (
                        <div key={`${subRevealGen}-ldash`} className="flex flex-col gap-1" style={vertStyle(vi++)}>
                          {STROKE_DASH_PRESETS.map(d => {
                            const isActive = (strokeDash || '') === d.value
                            return (
                              <button
                                key={d.label}
                                className={`h-8 w-24 flex items-center justify-center rounded-full border transition-colors disabled:opacity-40 ${isActive ? 'bg-navy border-leather text-parchment' : 'bg-navy border-navy/40 text-parchment/80 hover:border-parchment-border hover:text-parchment'}`}
                                aria-label={d.label}
                                title={d.label}
                                onClick={() => onStrokeStyleChange({ stroke_dash: d.value })}
                                disabled={anySelectedLocked}
                                style={{ boxShadow: PILL_SHADOW }}
                              >
                                <svg viewBox="0 0 64 10" className="w-14 h-2.5">
                                  <line x1="2" y1="5" x2="62" y2="5" stroke="currentColor" strokeWidth={2} strokeDasharray={d.dasharray === 'none' ? undefined : d.dasharray} strokeLinecap="round" />
                                </svg>
                              </button>
                            )
                          })}
                        </div>
                      )
                    })()}

                    {/* ── Start cap: marker picker ──────────────────── */}
                    {sub.id === 'fmt-start' && (
                      <div key={`${subRevealGen}-ms`} className="flex flex-wrap gap-1 justify-center w-24" style={vertStyle(0)}>
                        {MARKER_TYPES.map((m, mi) => (
                          <button
                            key={m}
                            className={`h-9 w-9 flex items-center justify-center rounded-full border transition-colors disabled:opacity-40 ${markerStart === m ? 'bg-navy border-leather text-parchment' : 'bg-navy border-navy/40 text-parchment/80 hover:border-parchment-border hover:text-parchment'}`}
                            title={m}
                            aria-label={`Start ${m}`}
                            onClick={() => onMarkerChange({ marker_start: m })}
                            disabled={anySelectedLocked}
                            style={{ ...vertStyle(mi), boxShadow: PILL_SHADOW }}
                          >
                            <MarkerIcon type={m} size={16} />
                          </button>
                        ))}
                      </div>
                    )}

                    {/* ── End cap: marker picker ────────────────────── */}
                    {sub.id === 'fmt-end' && (
                      <div key={`${subRevealGen}-me`} className="flex flex-wrap gap-1 justify-center w-24" style={vertStyle(0)}>
                        {MARKER_TYPES.map((m, mi) => (
                          <button
                            key={m}
                            className={`h-9 w-9 flex items-center justify-center rounded-full border transition-colors disabled:opacity-40 ${markerEnd === m ? 'bg-navy border-leather text-parchment' : 'bg-navy border-navy/40 text-parchment/80 hover:border-parchment-border hover:text-parchment'}`}
                            title={m}
                            aria-label={`End ${m}`}
                            onClick={() => onMarkerChange({ marker_end: m })}
                            disabled={anySelectedLocked}
                            style={{ ...vertStyle(mi), boxShadow: PILL_SHADOW }}
                          >
                            <MarkerIcon type={m} size={16} />
                          </button>
                        ))}
                      </div>
                    )}

                  </div>
                )}
              </div>
            ))
          })()}



        </div>
      )}
    </div>
  )
}
