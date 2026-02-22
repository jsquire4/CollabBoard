'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { ColorPicker } from './ColorPicker'

interface RichTextToolbarProps {
  editor: Editor | null
}

// ── Shared style constants ─────────────────────────────────────────────────────

const PILL_SHADOW = '0 4px 16px rgba(0,0,0,0.45), 0 1px 4px rgba(0,0,0,0.3)'
const SPRING = 'cubic-bezier(.34,1.56,.64,1)'

// ── Active state ──────────────────────────────────────────────────────────────

export interface ActiveState {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  highlight: boolean
  bulletList: boolean
  orderedList: boolean
  taskList: boolean
  h1: boolean
  h2: boolean
  h3: boolean
  textAlign: 'left' | 'center' | 'right'
  textColor: string | null
  fontFamily: string | null
  fontSize: string | null
}

export const EMPTY_ACTIVE: ActiveState = {
  bold: false, italic: false, underline: false, strike: false,
  highlight: false, bulletList: false, orderedList: false, taskList: false,
  h1: false, h2: false, h3: false,
  textAlign: 'left', textColor: null, fontFamily: null, fontSize: null,
}

export function readActiveState(editor: Editor | null): ActiveState {
  if (!editor || editor.isDestroyed) return EMPTY_ACTIVE
  return {
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    underline: editor.isActive('underline'),
    strike: editor.isActive('strike'),
    highlight: editor.isActive('highlight'),
    bulletList: editor.isActive('bulletList'),
    orderedList: editor.isActive('orderedList'),
    taskList: editor.isActive('taskList'),
    h1: editor.isActive('heading', { level: 1 }),
    h2: editor.isActive('heading', { level: 2 }),
    h3: editor.isActive('heading', { level: 3 }),
    textAlign: editor.isActive({ textAlign: 'center' }) ? 'center'
             : editor.isActive({ textAlign: 'right' }) ? 'right' : 'left',
    textColor: (editor.getAttributes('textStyle').color as string | undefined) ?? null,
    fontFamily: (editor.getAttributes('textStyle').fontFamily as string | undefined) ?? null,
    fontSize: (editor.getAttributes('textStyle').fontSize as string | undefined) ?? null,
  }
}

// ── Font options ──────────────────────────────────────────────────────────────

export const FONT_FAMILIES = [
  { label: 'Default', value: '' },
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: 'Serif', value: 'Georgia, serif' },
  { label: 'Mono', value: 'ui-monospace, monospace' },
  { label: 'Comic', value: '"Comic Sans MS", cursive' },
  { label: 'Impact', value: 'Impact, sans-serif' },
]

export const FONT_SIZES = ['10', '12', '14', '16', '18', '20', '24', '28', '32', '36', '48', '64']

// ── Shared button components ─────────────────────────────────────────────────

interface RichBtnProps {
  label: string
  isActive: boolean
  onClick: () => void
  children: React.ReactNode
  style?: React.CSSProperties
  pillStyle?: React.CSSProperties
}

export function RichBtn({ label, isActive, onClick, children, style, pillStyle }: RichBtnProps) {
  return (
    <button
      type="button"
      title={label}
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      style={{ ...pillStyle, ...style }}
      className={`flex h-10 w-10 items-center justify-center rounded-full border text-xs font-medium transition-colors shrink-0
        ${isActive
          ? 'bg-navy border-leather text-parchment'
          : 'bg-navy border-navy/40 text-parchment/80 hover:border-parchment-border hover:text-parchment'}`}
    >
      {children}
    </button>
  )
}

export function RichSep() {
  return <div className="w-1.5 shrink-0" />
}

// ── Internal aliases (keep original names for the monolithic component) ───────
const Btn = RichBtn
const Sep = RichSep

// ── Stagger helper ───────────────────────────────────────────────────────────

function staggerStyle(revealed: boolean | undefined, i: number): React.CSSProperties {
  if (revealed === undefined) return { boxShadow: PILL_SHADOW }
  return {
    opacity: revealed ? 1 : 0,
    transform: revealed ? 'scale(1)' : 'scale(0.3)',
    boxShadow: PILL_SHADOW,
    transition: `opacity 140ms ${SPRING} ${i * 25}ms, transform 140ms ${SPRING} ${i * 25}ms`,
  }
}

// ── Sub-components for inline use ────────────────────────────────────────────

interface RichFontControlsProps {
  editor: Editor | null
  active: ActiveState
  run: (cmd: (e: Editor) => void) => void
  applyFontSize: (value: string) => void
  fontSizeInput: string
  setFontSizeInput: (v: string) => void
  revealed?: boolean
  vertical?: boolean
}

const selectCls = 'h-10 rounded-full px-2.5 text-[11px] cursor-pointer outline-none border bg-navy border-navy/40 text-parchment transition-colors hover:border-parchment-border'

export function RichFontControls({ editor, active, run, applyFontSize, fontSizeInput, setFontSizeInput, revealed, vertical }: RichFontControlsProps) {
  return (
    <div className={vertical ? 'flex flex-col items-center gap-1.5' : 'flex items-center gap-1.5'} onMouseDown={(e) => e.preventDefault()}>
      <select
        value={active.fontFamily ?? ''}
        onChange={(e) => {
          const val = e.target.value
          run(ed => val
            ? ed.chain().focus().setFontFamily(val).run()
            : ed.chain().focus().unsetFontFamily().run()
          )
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className={`${selectCls} w-20`}
        title="Font family"
        style={staggerStyle(revealed, 0)}
      >
        {FONT_FAMILIES.map(f => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>

      <input
        type="number"
        min={6}
        max={200}
        value={fontSizeInput}
        onChange={(e) => setFontSizeInput(e.target.value)}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { applyFontSize(fontSizeInput); editor?.commands.focus() }
        }}
        onBlur={() => applyFontSize(fontSizeInput)}
        placeholder="px"
        className={`${selectCls} w-12 text-center`}
        title="Font size"
        style={staggerStyle(revealed, 1)}
      />

      <select
        value={fontSizeInput}
        onChange={(e) => { setFontSizeInput(e.target.value); applyFontSize(e.target.value) }}
        onMouseDown={(e) => e.stopPropagation()}
        className={`${selectCls} w-9 px-0.5`}
        title="Font size presets"
        style={staggerStyle(revealed, 2)}
      >
        <option value="">—</option>
        {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  )
}

interface RichFormatControlsProps {
  editor: Editor | null
  active: ActiveState
  run: (cmd: (e: Editor) => void) => void
  revealed?: boolean
}

export function RichFormatControls({ editor: _editor, active, run, revealed }: RichFormatControlsProps) {
  let idx = 0
  return (
    <div className="flex items-center gap-1.5" onMouseDown={(e) => e.preventDefault()}>
      <Btn label="Bold (⌘B)" isActive={active.bold}
        onClick={() => run(e => e.chain().focus().toggleBold().run())}
        style={{ fontWeight: 'bold' }}
        pillStyle={staggerStyle(revealed, idx++)}
      >B</Btn>
      <Btn label="Italic (⌘I)" isActive={active.italic}
        onClick={() => run(e => e.chain().focus().toggleItalic().run())}
        style={{ fontStyle: 'italic' }}
        pillStyle={staggerStyle(revealed, idx++)}
      >I</Btn>
      <Btn label="Underline (⌘U)" isActive={active.underline}
        onClick={() => run(e => e.chain().focus().toggleUnderline().run())}
        style={{ textDecoration: 'underline' }}
        pillStyle={staggerStyle(revealed, idx++)}
      >U</Btn>
      <Btn label="Strikethrough" isActive={active.strike}
        onClick={() => run(e => e.chain().focus().toggleStrike().run())}
        style={{ textDecoration: 'line-through' }}
        pillStyle={staggerStyle(revealed, idx++)}
      >S</Btn>

      <Sep />

      <Btn label="Highlight" isActive={active.highlight}
        onClick={() => run(e => e.chain().focus().toggleHighlight().run())}
        style={active.highlight ? { backgroundColor: '#fef08a', color: '#1c1c1e', ...staggerStyle(revealed, idx++) } : staggerStyle(revealed, idx++)}
      >H</Btn>

      {/* Inline text color */}
      <div
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
        style={staggerStyle(revealed, idx++)}
      >
        <ColorPicker
          compact
          label="Text color"
          selectedColor={active.textColor ?? '#FFFFFF'}
          onColorChange={(color) => run(e => e.chain().focus().setColor(color).run())}
        />
      </div>

      <Sep />

      <Btn label="Heading 1" isActive={active.h1}
        onClick={() => run(e => e.chain().focus().toggleHeading({ level: 1 }).run())}
        pillStyle={staggerStyle(revealed, idx++)}
      >H1</Btn>
      <Btn label="Heading 2" isActive={active.h2}
        onClick={() => run(e => e.chain().focus().toggleHeading({ level: 2 }).run())}
        pillStyle={staggerStyle(revealed, idx++)}
      >H2</Btn>
      <Btn label="Heading 3" isActive={active.h3}
        onClick={() => run(e => e.chain().focus().toggleHeading({ level: 3 }).run())}
        pillStyle={staggerStyle(revealed, idx++)}
      >H3</Btn>
    </div>
  )
}

interface RichListControlsProps {
  active: ActiveState
  run: (cmd: (e: Editor) => void) => void
  revealed?: boolean
}

export function RichListControls({ active, run, revealed }: RichListControlsProps) {
  let idx = 0
  return (
    <div className="flex items-center gap-1.5" onMouseDown={(e) => e.preventDefault()}>
      <Btn label="Bullet list" isActive={active.bulletList}
        onClick={() => run(e => e.chain().focus().toggleBulletList().run())}
        pillStyle={staggerStyle(revealed, idx++)}
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      </Btn>
      <Btn label="Numbered list" isActive={active.orderedList}
        onClick={() => run(e => e.chain().focus().toggleOrderedList().run())}
        pillStyle={staggerStyle(revealed, idx++)}
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2" />
        </svg>
      </Btn>
      <Btn label="Checklist" isActive={active.taskList}
        onClick={() => run(e => e.chain().focus().toggleTaskList().run())}
        pillStyle={staggerStyle(revealed, idx++)}
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
        </svg>
      </Btn>

      <Sep />

      <Btn label="Align left" isActive={active.textAlign === 'left'}
        onClick={() => run(e => e.chain().focus().setTextAlign('left').run())}
        pillStyle={staggerStyle(revealed, idx++)}
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M3 6h18M3 10h12M3 14h18M3 18h12" />
        </svg>
      </Btn>
      <Btn label="Align center" isActive={active.textAlign === 'center'}
        onClick={() => run(e => e.chain().focus().setTextAlign('center').run())}
        pillStyle={staggerStyle(revealed, idx++)}
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M3 6h18M6 10h12M3 14h18M6 18h12" />
        </svg>
      </Btn>
      <Btn label="Align right" isActive={active.textAlign === 'right'}
        onClick={() => run(e => e.chain().focus().setTextAlign('right').run())}
        pillStyle={staggerStyle(revealed, idx++)}
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M3 6h18M9 10h12M3 14h18M9 18h12" />
        </svg>
      </Btn>
    </div>
  )
}

// ── Main component (backward compat — still used by tests) ───────────────────

export function RichTextToolbar({ editor }: RichTextToolbarProps) {
  const [active, setActive] = useState<ActiveState>(EMPTY_ACTIVE)
  const [fontSizeInput, setFontSizeInput] = useState('')

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const handler = () => {
      const state = readActiveState(editor)
      setActive(state)
      setFontSizeInput(state.fontSize ? state.fontSize.replace('px', '') : '')
    }
    handler()
    editor.on('selectionUpdate', handler)
    editor.on('transaction', handler)
    return () => {
      editor.off('selectionUpdate', handler)
      editor.off('transaction', handler)
    }
  }, [editor])

  const run = useCallback((cmd: (e: Editor) => void) => {
    if (!editor || editor.isDestroyed) return
    cmd(editor)
  }, [editor])

  const applyFontSize = useCallback((value: string) => {
    if (!editor || editor.isDestroyed) return
    const px = parseInt(value, 10)
    if (!isNaN(px) && px > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(editor.chain().focus() as any).setFontSize(`${px}px`).run()
    }
  }, [editor])

  return (
    <div className="flex flex-col gap-1.5" onMouseDown={(e) => e.preventDefault()}>

      {/* Row 1 — font family + size */}
      <RichFontControls
        editor={editor}
        active={active}
        run={run}
        applyFontSize={applyFontSize}
        fontSizeInput={fontSizeInput}
        setFontSizeInput={setFontSizeInput}
      />

      {/* Row 2 — formatting + headings */}
      <RichFormatControls editor={editor} active={active} run={run} />

      {/* Row 3 — lists + alignment */}
      <RichListControls active={active} run={run} />
    </div>
  )
}
