'use client'

import React, { useEffect, useRef } from 'react'
import { EditorContent, type Editor } from '@tiptap/react'

interface TipTapEditorOverlayProps {
  editor: Editor | null
  editingId: string | null
  editingField: 'text' | 'title'
  overlayStyle: React.CSSProperties
  onFinish: () => void
}

export function TipTapEditorOverlay({
  editor,
  editingId,
  editingField,
  overlayStyle,
  onFinish,
}: TipTapEditorOverlayProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Handle Escape to finish editing
  useEffect(() => {
    if (!editingId || editingField === 'title') return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.isComposing) {
        e.preventDefault()
        onFinish()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [editingId, editingField, onFinish])

  // Handle clicks outside editor to finish editing
  useEffect(() => {
    if (!editingId || editingField === 'title') return

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      // Don't close if the click is inside the editor or inside a toolbar
      // that's designed to work alongside the editor (e.g. SelectionBar)
      if (wrapperRef.current?.contains(target)) return
      if ((target as HTMLElement).closest?.('[data-keeps-rich-text-alive]')) return
      onFinish()
    }

    // Delay listener to avoid capturing the double-click that started editing
    let listenerAdded = false
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleMouseDown)
      listenerAdded = true
    }, 100)

    return () => {
      clearTimeout(timer)
      if (listenerAdded) document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [editingId, editingField, onFinish])

  if (!editingId || editingField === 'title' || !editor) return null

  return (
    <div
      ref={wrapperRef}
      className="rich-text"
      style={overlayStyle}
      onMouseDown={(e) => {
        // Prevent blur when clicking inside editor
        e.stopPropagation()
      }}
    >
      <EditorContent
        editor={editor}
        style={{
          width: '100%',
          height: '100%',
          outline: 'none',
        }}
      />
    </div>
  )
}
