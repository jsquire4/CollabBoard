'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { ColorPicker } from './ColorPicker'

interface RichTextToolbarProps {
  editor: Editor | null
  dark?: boolean
}

// ── Active state ──────────────────────────────────────────────────────────────

interface ActiveState {
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

const EMPTY_ACTIVE: ActiveState = {
  bold: false, italic: false, underline: false, strike: false,
  highlight: false, bulletList: false, orderedList: false, taskList: false,
  h1: false, h2: false, h3: false,
  textAlign: 'left', textColor: null, fontFamily: null, fontSize: null,
}

function readActiveState(editor: Editor | null): ActiveState {
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

const FONT_FAMILIES = [
  { label: 'Default', value: '' },
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: 'Serif', value: 'Georgia, serif' },
  { label: 'Mono', value: 'ui-monospace, monospace' },
  { label: 'Comic', value: '"Comic Sans MS", cursive' },
  { label: 'Impact', value: 'Impact, sans-serif' },
]

const FONT_SIZES = ['10', '12', '14', '16', '18', '20', '24', '28', '32', '36', '48', '64']

// ── Btn component ─────────────────────────────────────────────────────────────

interface BtnProps {
  label: string
  isActive: boolean
  onClick: () => void
  children: React.ReactNode
  style?: React.CSSProperties
}

function Btn({ label, isActive, onClick, children, style }: BtnProps) {
  return (
    <button
      type="button"
      title={label}
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      style={style}
      className={`flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors shrink-0
        ${isActive ? 'bg-white/20 text-parchment' : 'text-parchment/75 hover:bg-white/10'}`}
    >
      {children}
    </button>
  )
}

function Sep() {
  return <div className="w-px h-5 bg-white/20 mx-0.5 shrink-0" />
}

// ── Main component ────────────────────────────────────────────────────────────

export function RichTextToolbar({ editor, dark: _dark }: RichTextToolbarProps) {
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

  const selectCls = 'h-7 rounded px-1 text-[11px] cursor-pointer outline-none border bg-white/10 border-white/20 text-parchment transition'

  return (
    <div className="flex flex-col gap-1.5" onMouseDown={(e) => e.preventDefault()}>

      {/* Row 1 — font family + size */}
      <div className="flex items-center gap-1">
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
          className={`${selectCls} flex-1`}
          title="Font family"
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
        />

        <select
          value={fontSizeInput}
          onChange={(e) => { setFontSizeInput(e.target.value); applyFontSize(e.target.value) }}
          onMouseDown={(e) => e.stopPropagation()}
          className={`${selectCls} w-8 px-0`}
          title="Font size presets"
        >
          <option value="">—</option>
          {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Row 2 — formatting + headings */}
      <div className="flex items-center gap-0.5 flex-wrap">
        <Btn label="Bold (⌘B)" isActive={active.bold}
          onClick={() => run(e => e.chain().focus().toggleBold().run())}
          style={{ fontWeight: 'bold' }}
        >B</Btn>
        <Btn label="Italic (⌘I)" isActive={active.italic}
          onClick={() => run(e => e.chain().focus().toggleItalic().run())}
          style={{ fontStyle: 'italic' }}
        >I</Btn>
        <Btn label="Underline (⌘U)" isActive={active.underline}
          onClick={() => run(e => e.chain().focus().toggleUnderline().run())}
          style={{ textDecoration: 'underline' }}
        >U</Btn>
        <Btn label="Strikethrough" isActive={active.strike}
          onClick={() => run(e => e.chain().focus().toggleStrike().run())}
          style={{ textDecoration: 'line-through' }}
        >S</Btn>

        <Sep />

        <Btn label="Highlight" isActive={active.highlight}
          onClick={() => run(e => e.chain().focus().toggleHighlight().run())}
          style={active.highlight ? { backgroundColor: '#fef08a', color: '#1c1c1e' } : undefined}
        >H</Btn>

        {/* Inline text color */}
        <div onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}>
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
        >H1</Btn>
        <Btn label="Heading 2" isActive={active.h2}
          onClick={() => run(e => e.chain().focus().toggleHeading({ level: 2 }).run())}
        >H2</Btn>
        <Btn label="Heading 3" isActive={active.h3}
          onClick={() => run(e => e.chain().focus().toggleHeading({ level: 3 }).run())}
        >H3</Btn>
      </div>

      {/* Row 3 — lists + alignment */}
      <div className="flex items-center gap-0.5 flex-wrap">
        <Btn label="Bullet list" isActive={active.bulletList}
          onClick={() => run(e => e.chain().focus().toggleBulletList().run())}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
          </svg>
        </Btn>
        <Btn label="Numbered list" isActive={active.orderedList}
          onClick={() => run(e => e.chain().focus().toggleOrderedList().run())}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2" />
          </svg>
        </Btn>
        <Btn label="Checklist" isActive={active.taskList}
          onClick={() => run(e => e.chain().focus().toggleTaskList().run())}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
          </svg>
        </Btn>

        <Sep />

        <Btn label="Align left" isActive={active.textAlign === 'left'}
          onClick={() => run(e => e.chain().focus().setTextAlign('left').run())}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M3 6h18M3 10h12M3 14h18M3 18h12" />
          </svg>
        </Btn>
        <Btn label="Align center" isActive={active.textAlign === 'center'}
          onClick={() => run(e => e.chain().focus().setTextAlign('center').run())}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M3 6h18M6 10h12M3 14h18M6 18h12" />
          </svg>
        </Btn>
        <Btn label="Align right" isActive={active.textAlign === 'right'}
          onClick={() => run(e => e.chain().focus().setTextAlign('right').run())}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M3 6h18M9 10h12M3 14h18M9 18h12" />
          </svg>
        </Btn>
      </div>
    </div>
  )
}
