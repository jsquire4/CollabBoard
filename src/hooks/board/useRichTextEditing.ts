'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useEditor, type Editor } from '@tiptap/react'
import Konva from 'konva'
import { BoardObject } from '@/types/board'
import { TIPTAP_EXTENSIONS } from '@/lib/richtext/extensions'
import { extractPlainText, plainTextToTipTap } from '@/lib/richText'
import type { TipTapDoc } from '@/types/board'
import { STICKY_TITLE_CHAR_LIMIT } from './useTextEditing'

export interface RichTextBeforeState {
  text: string
  rich_text: string | null
}

export interface UseRichTextEditingDeps {
  objects: Map<string, BoardObject>
  stageScale: number
  canEdit: boolean
  enabled?: boolean
  shapeRefs: React.RefObject<Map<string, Konva.Node>>
  onUpdateText: (id: string, text: string) => void
  onUpdateTitle: (id: string, title: string) => void
  onUpdateRichText: (id: string, json: string, before: RichTextBeforeState) => void
  onEditingChange?: (isEditing: boolean) => void
  onActivity?: () => void
  pendingEditId?: string | null
  onPendingEditConsumed?: () => void
  tryEnterGroup: (id: string) => boolean
}

export function useRichTextEditing({
  objects, stageScale, canEdit,
  enabled = true,
  shapeRefs,
  onUpdateText, onUpdateTitle, onUpdateRichText,
  onEditingChange, onActivity,
  pendingEditId, onPendingEditConsumed,
  tryEnterGroup,
}: UseRichTextEditingDeps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<'text' | 'title'>('text')
  const [overlayStyle, setOverlayStyle] = useState<React.CSSProperties>({})
  const lastDblClickRef = useRef<{ id: string; time: number } | null>(null)
  const editingIdRef = useRef<string | null>(null)
  useEffect(() => { editingIdRef.current = editingId }, [editingId])

  // Snapshot of object state at edit start for correct undo (fix: captures before live broadcasts mutate text)
  const beforeEditRef = useRef<RichTextBeforeState | null>(null)

  // Track focus timeout so rapid shape switching can cancel stale focus calls
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Ref for onUpdateText so the useEditor onUpdate closure always calls the latest version
  const onUpdateTextRef = useRef(onUpdateText)
  useEffect(() => { onUpdateTextRef.current = onUpdateText }, [onUpdateText])

  // For plain text textarea (title editing)
  const [editText, setEditText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [textareaStyle, setTextareaStyle] = useState<React.CSSProperties>({})

  const editor = useEditor({
    // When disabled, use minimal config to avoid wasting memory on unused extensions
    extensions: enabled ? TIPTAP_EXTENSIONS : [],
    content: '',
    editable: enabled,
    // Don't auto-focus — we do it manually after positioning
    autofocus: false,
    onUpdate: ({ editor: ed }) => {
      // Broadcast plain text to collaborators during editing
      const id = editingIdRef.current
      if (!id) return
      const doc = ed.getJSON() as TipTapDoc
      const plain = extractPlainText(doc)
      onUpdateTextRef.current(id, plain)
    },
  }, [enabled])

  const editorRef = useRef<Editor | null>(null)
  useEffect(() => { editorRef.current = editor }, [editor])

  // Refs for commit helper — avoids circular dependency between handleStartEdit and handleFinishEdit
  const editingFieldRef = useRef(editingField)
  useEffect(() => { editingFieldRef.current = editingField }, [editingField])
  const editTextRef = useRef(editText)
  useEffect(() => { editTextRef.current = editText }, [editText])
  const onUpdateTitleRef = useRef(onUpdateTitle)
  useEffect(() => { onUpdateTitleRef.current = onUpdateTitle }, [onUpdateTitle])
  const onUpdateRichTextRef = useRef(onUpdateRichText)
  useEffect(() => { onUpdateRichTextRef.current = onUpdateRichText }, [onUpdateRichText])

  // Commit the current edit (if any) — reads from refs so it can be called from handleStartEdit
  const commitCurrentEdit = useCallback(() => {
    const id = editingIdRef.current
    if (!id || !enabled) return

    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current)
      focusTimerRef.current = null
    }

    if (editingFieldRef.current === 'title') {
      onUpdateTitleRef.current(id, editTextRef.current.slice(0, STICKY_TITLE_CHAR_LIMIT))
    } else {
      if (editor && !editor.isDestroyed) {
        const doc = editor.getJSON() as TipTapDoc
        const json = JSON.stringify(doc)
        const before = beforeEditRef.current ?? { text: '', rich_text: null }
        onUpdateRichTextRef.current(id, json, before)
      }
    }

    beforeEditRef.current = null
  }, [editor, enabled])

  const handleStartEdit = useCallback((id: string, textNode: Konva.Text, field: 'text' | 'title' = 'text') => {
    if (!canEdit) return
    onActivity?.()
    if (tryEnterGroup(id)) return

    const obj = objects.get(id)
    if (!obj) return

    // Commit any in-progress edit before starting a new one (prevents data loss on shape switch)
    commitCurrentEdit()

    // Cancel any pending focus from a previous edit (prevents stale focus steal)
    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current)
      focusTimerRef.current = null
    }

    // Capture object state BEFORE editing begins for correct undo
    beforeEditRef.current = { text: obj.text, rich_text: obj.rich_text ?? null }

    setEditingId(id)
    setEditingField(field)

    if (field === 'title') {
      // Title stays plain text
      const initialText = (obj.title ?? 'Note').slice(0, STICKY_TITLE_CHAR_LIMIT)
      setEditText(initialText)

      const textRect = textNode.getClientRect()
      const fontFamily = obj.font_family || 'sans-serif'
      const textColor = obj.text_color ?? '#374151'
      const textAlign = (obj.text_align ?? 'left') as React.CSSProperties['textAlign']
      setTextareaStyle({
        position: 'absolute',
        top: `${textRect.y}px`,
        left: `${textRect.x}px`,
        width: `${textRect.width}px`,
        height: `${textRect.height}px`,
        fontSize: `${14 * stageScale}px`,
        fontFamily,
        fontWeight: 'bold',
        fontStyle: 'normal',
        textAlign,
        padding: '0px',
        margin: '0px',
        border: 'none',
        outline: 'none',
        resize: 'none',
        background: 'transparent',
        color: textColor,
        overflow: 'hidden',
        lineHeight: '1.3',
        zIndex: 100,
      })
    } else {
      // Rich text editing — initialize TipTap editor
      let doc: TipTapDoc
      if (obj.rich_text) {
        try {
          doc = JSON.parse(obj.rich_text) as TipTapDoc
        } catch {
          doc = plainTextToTipTap(obj.text || '')
        }
      } else {
        doc = plainTextToTipTap(obj.text || '')
      }

      if (editor && !editor.isDestroyed) {
        editor.commands.setContent(doc)
        // Focus after a tick to allow the overlay to position
        focusTimerRef.current = setTimeout(() => {
          focusTimerRef.current = null
          if (editor && !editor.isDestroyed) {
            editor.commands.focus('end')
          }
        }, 0)
      }

      // Compute overlay position in canvas-space
      const padding = obj.text_padding ?? 8
      const isStickyNote = obj.type === 'sticky_note'
      const titleHeight = isStickyNote ? 44 : 0
      const topOffset = isStickyNote ? titleHeight + 6 : 0

      setOverlayStyle({
        position: 'absolute',
        left: obj.x + padding,
        top: obj.y + topOffset + padding,
        width: obj.width - padding * 2,
        minHeight: obj.height - topOffset - padding * 2,
        maxHeight: obj.height - topOffset - padding * 2,
        overflowY: 'auto',
        fontSize: `${obj.font_size ?? 16}px`,
        fontFamily: obj.font_family ?? 'sans-serif',
        color: obj.text_color ?? '#000000',
        lineHeight: 1.4,
        outline: 'none',
        pointerEvents: 'auto',
        wordBreak: 'break-word',
        transform: obj.rotation ? `rotate(${obj.rotation}deg)` : undefined,
        transformOrigin: obj.rotation ? `${-padding}px ${-(topOffset + padding)}px` : undefined,
      })
    }
  }, [objects, stageScale, canEdit, tryEnterGroup, onActivity, editor, commitCurrentEdit])

  const handleFinishEdit = useCallback(() => {
    commitCurrentEdit()
    setEditingId(null)
  }, [commitCurrentEdit])

  const handleShapeDoubleClick = useCallback((id: string) => {
    if (tryEnterGroup(id)) return
    lastDblClickRef.current = { id, time: Date.now() }
  }, [tryEnterGroup])

  const startGeometricTextEdit = useCallback((id: string) => {
    const obj = objects.get(id)
    if (!obj || !canEdit) return
    const konvaNode = shapeRefs.current.get(id)
    if (!konvaNode) return
    const textNode = (konvaNode as Konva.Group).findOne?.('Text') as Konva.Text | undefined
    if (textNode) {
      handleStartEdit(id, textNode)
    } else {
      // Shape has no text yet — initialize with empty text then start editing
      onUpdateText(id, ' ')
      setTimeout(() => {
        const node = shapeRefs.current.get(id)
        const tn = (node as Konva.Group)?.findOne?.('Text') as Konva.Text | undefined
        if (tn) handleStartEdit(id, tn)
      }, 50)
    }
  }, [objects, canEdit, handleStartEdit, onUpdateText])

  // Focus textarea when title editing starts
  useEffect(() => {
    if (editingId && editingField === 'title' && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [editingId, editingField])

  // Notify parent when editing state changes
  useEffect(() => {
    onEditingChange?.(!!editingId)
  }, [editingId, onEditingChange])

  // Close editor if the shape being edited is deleted by a remote user
  useEffect(() => {
    if (editingId && !objects.has(editingId)) {
      beforeEditRef.current = null
      setEditingId(null)
    }
  }, [editingId, objects])

  // Auto-enter text edit mode for newly created text boxes
  useEffect(() => {
    if (!pendingEditId) return
    const id = pendingEditId
    const startTime = performance.now()
    let rafId: number
    const poll = () => {
      const node = shapeRefs.current.get(id)
      if (node) {
        onPendingEditConsumed?.()
        startGeometricTextEdit(id)
        return
      }
      if (performance.now() - startTime < 500) {
        rafId = requestAnimationFrame(poll)
      } else {
        onPendingEditConsumed?.()
      }
    }
    rafId = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(rafId)
  }, [pendingEditId, onPendingEditConsumed, startGeometricTextEdit])

  return {
    editingId,
    editingField,
    editText,
    setEditText,
    textareaStyle,
    textareaRef,
    editor,
    editorRef,
    overlayStyle,
    handleStartEdit,
    handleFinishEdit,
    handleShapeDoubleClick,
    startGeometricTextEdit,
    lastDblClickRef,
  }
}
