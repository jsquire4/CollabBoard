'use client'

import React, { useCallback, useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'

interface RichTextToolbarProps {
  editor: Editor | null
  dark?: boolean
}

interface ToolbarButtonProps {
  label: string
  shortLabel: string
  isActive: boolean
  onClick: () => void
  dark?: boolean
  style?: React.CSSProperties
}

function ToolbarButton({ label, shortLabel, isActive, onClick, dark, style }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={label}
      onMouseDown={(e) => {
        e.preventDefault() // prevent editor blur
        onClick()
      }}
      className={`flex h-8 w-8 items-center justify-center rounded text-xs font-medium transition-colors
        ${isActive
          ? (dark ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700')
          : (dark ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100')
        }`}
      style={style}
    >
      {shortLabel}
    </button>
  )
}

// Active state snapshot — read from editor in event handlers, stored in state for render
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
}

const EMPTY_ACTIVE: ActiveState = {
  bold: false, italic: false, underline: false, strike: false,
  highlight: false, bulletList: false, orderedList: false, taskList: false,
  h1: false, h2: false, h3: false,
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
  }
}

export function RichTextToolbar({ editor, dark }: RichTextToolbarProps) {
  const [active, setActive] = useState<ActiveState>(EMPTY_ACTIVE)

  // Subscribe to editor selection/transaction changes to update active states
  useEffect(() => {
    if (!editor || editor.isDestroyed) return

    const handler = () => setActive(readActiveState(editor))
    // Initial read
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

  return (
    <div
      className="flex flex-col items-center gap-0.5"
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Text formatting */}
      <ToolbarButton
        label="Bold"
        shortLabel="B"
        isActive={active.bold}
        onClick={() => run(e => e.chain().focus().toggleBold().run())}
        dark={dark}
        style={{ fontWeight: 'bold' }}
      />
      <ToolbarButton
        label="Italic"
        shortLabel="I"
        isActive={active.italic}
        onClick={() => run(e => e.chain().focus().toggleItalic().run())}
        dark={dark}
        style={{ fontStyle: 'italic' }}
      />
      <ToolbarButton
        label="Underline"
        shortLabel="U"
        isActive={active.underline}
        onClick={() => run(e => e.chain().focus().toggleUnderline().run())}
        dark={dark}
        style={{ textDecoration: 'underline' }}
      />
      <ToolbarButton
        label="Strikethrough"
        shortLabel="S"
        isActive={active.strike}
        onClick={() => run(e => e.chain().focus().toggleStrike().run())}
        dark={dark}
        style={{ textDecoration: 'line-through' }}
      />

      <div className={`my-1 h-px w-8 ${dark ? 'bg-slate-700' : 'bg-slate-200'}`} />

      {/* Highlight */}
      <ToolbarButton
        label="Highlight"
        shortLabel="H"
        isActive={active.highlight}
        onClick={() => run(e => e.chain().focus().toggleHighlight().run())}
        dark={dark}
        style={{ backgroundColor: active.highlight ? '#fef08a' : undefined }}
      />

      <div className={`my-1 h-px w-8 ${dark ? 'bg-slate-700' : 'bg-slate-200'}`} />

      {/* Lists */}
      <ToolbarButton
        label="Bullet List"
        shortLabel="•"
        isActive={active.bulletList}
        onClick={() => run(e => e.chain().focus().toggleBulletList().run())}
        dark={dark}
      />
      <ToolbarButton
        label="Ordered List"
        shortLabel="1."
        isActive={active.orderedList}
        onClick={() => run(e => e.chain().focus().toggleOrderedList().run())}
        dark={dark}
      />
      <ToolbarButton
        label="Checklist"
        shortLabel="☑"
        isActive={active.taskList}
        onClick={() => run(e => e.chain().focus().toggleTaskList().run())}
        dark={dark}
      />

      <div className={`my-1 h-px w-8 ${dark ? 'bg-slate-700' : 'bg-slate-200'}`} />

      {/* Headings */}
      <ToolbarButton
        label="Heading 1"
        shortLabel="H1"
        isActive={active.h1}
        onClick={() => run(e => e.chain().focus().toggleHeading({ level: 1 }).run())}
        dark={dark}
      />
      <ToolbarButton
        label="Heading 2"
        shortLabel="H2"
        isActive={active.h2}
        onClick={() => run(e => e.chain().focus().toggleHeading({ level: 2 }).run())}
        dark={dark}
      />
      <ToolbarButton
        label="Heading 3"
        shortLabel="H3"
        isActive={active.h3}
        onClick={() => run(e => e.chain().focus().toggleHeading({ level: 3 }).run())}
        dark={dark}
      />
    </div>
  )
}
