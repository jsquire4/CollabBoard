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
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        onFinish()
      }
    }

    // Delay listener to avoid capturing the double-click that started editing
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleMouseDown)
    }, 100)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [editingId, editingField, onFinish])

  if (!editingId || editingField === 'title' || !editor) return null

  return (
    <div
      ref={wrapperRef}
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
