'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import Konva from 'konva'
import { BoardObject } from '@/types/board'
import { nextCell, parseTableData } from '@/lib/table/tableUtils'
import { TEXTAREA_BASE_STYLE } from '@/lib/textConstants'

// ── Constants ────────────────────────────────────────────────────────

const SHAPE_TEXT_CHAR_LIMIT = 256
const FRAME_TITLE_CHAR_LIMIT = 256
const STICKY_TITLE_CHAR_LIMIT = 256
const STICKY_TEXT_CHAR_LIMIT = 10000

export function getTextCharLimit(type: string): number | undefined {
  if (type === 'sticky_note') return STICKY_TEXT_CHAR_LIMIT
  if (type === 'frame') return FRAME_TITLE_CHAR_LIMIT
  return SHAPE_TEXT_CHAR_LIMIT
}

export { STICKY_TITLE_CHAR_LIMIT }

// ── Hook interface ──────────────────────────────────────────────────

export interface UseTextEditingDeps {
  objects: Map<string, BoardObject>
  stageScale: number
  canEdit: boolean
  stageRef: React.RefObject<Konva.Stage | null>
  shapeRefs: React.RefObject<Map<string, Konva.Node>>
  onUpdateText: (id: string, text: string) => void
  onUpdateTitle: (id: string, title: string) => void
  onEditingChange?: (isEditing: boolean) => void
  onActivity?: () => void
  onUpdateTableCell?: (id: string, row: number, col: number, text: string) => void
  pendingEditId?: string | null
  onPendingEditConsumed?: () => void
  tryEnterGroup: (id: string) => boolean
}

// ── Hook ────────────────────────────────────────────────────────────

export function useTextEditing({
  objects, stageScale, canEdit,
  stageRef, shapeRefs,
  onUpdateText, onUpdateTitle,
  onEditingChange, onActivity,
  onUpdateTableCell,
  pendingEditId, onPendingEditConsumed,
  tryEnterGroup,
}: UseTextEditingDeps) {
  // ── State ──────────────────────────────────────────────────────────

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<'text' | 'title'>('text')
  const [editingCellCoords, setEditingCellCoords] = useState<{ row: number; col: number } | null>(null)
  const [textareaStyle, setTextareaStyle] = useState<React.CSSProperties>({})
  const [editText, setEditText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Set to true in the boundary branch of handleCellKeyDown to signal that
  // the current cell was already saved, so handleFinishEdit should skip it.
  const cellAlreadySavedRef = useRef(false)

  // Track last double-click for triple-click detection on geometric shapes
  const lastDblClickRef = useRef<{ id: string; time: number } | null>(null)

  // ── Callbacks ──────────────────────────────────────────────────────

  const handleStartEdit = useCallback((id: string, textNode: Konva.Text | null, field: 'text' | 'title' = 'text') => {
    if (!canEdit) return
    onActivity?.()
    // If double-clicking a child of a selected group, enter the group instead
    if (tryEnterGroup(id)) return

    const stage = stageRef.current
    if (!stage) return

    const obj = objects.get(id)
    if (!obj) return

    if (!textNode) return // plain-text editing requires a positioned Konva Text node
    const textRect = textNode.getClientRect()

    setEditingId(id)
    setEditingField(field)

    let initialText: string
    if (field === 'title') {
      initialText = (obj.title ?? 'Note').slice(0, STICKY_TITLE_CHAR_LIMIT)
    } else {
      const charLimit = getTextCharLimit(obj.type)
      initialText = charLimit ? (obj.text || '').slice(0, charLimit) : (obj.text || '')
    }
    setEditText(initialText)

    const fontSize = field === 'title' ? 14 : obj.font_size
    const fontFamily = obj.font_family || 'sans-serif'
    const fontStyle = obj.font_style || 'normal'
    const isBold = fontStyle === 'bold' || fontStyle === 'bold italic'
    const isItalic = fontStyle === 'italic' || fontStyle === 'bold italic'
    const textColor = field === 'title' ? (obj.text_color ?? '#374151') : (obj.text_color ?? '#000000')
    const textAlign = (obj.text_align ?? (obj.type === 'sticky_note' ? 'left' : 'center')) as React.CSSProperties['textAlign']
    setTextareaStyle({
      ...TEXTAREA_BASE_STYLE,
      top: `${textRect.y}px`,
      left: `${textRect.x}px`,
      width: `${textRect.width}px`,
      height: `${textRect.height}px`,
      fontSize: `${fontSize * stageScale}px`,
      fontFamily,
      fontWeight: isBold || field === 'title' ? 'bold' : 'normal',
      fontStyle: isItalic ? 'italic' : 'normal',
      textAlign,
      color: textColor,
      lineHeight: field === 'title' ? '1.3' : '1.2',
    })
  }, [objects, stageScale, canEdit, tryEnterGroup, onActivity])

  const handleFinishEdit = useCallback(() => {
    if (editingId) {
      if (editingCellCoords) {
        if (!cellAlreadySavedRef.current) {
          onUpdateTableCell?.(editingId, editingCellCoords.row, editingCellCoords.col, editText)
        }
        cellAlreadySavedRef.current = false
        setEditingCellCoords(null)
      } else if (editingField === 'title') {
        onUpdateTitle(editingId, editText.slice(0, STICKY_TITLE_CHAR_LIMIT))
      } else {
        onUpdateText(editingId, editText)
      }
      setEditingId(null)
    }
  }, [editingId, editingField, editingCellCoords, editText, onUpdateText, onUpdateTitle, onUpdateTableCell])

  const handleStartCellEdit = useCallback((id: string, textNode: Konva.Text, row: number, col: number) => {
    if (!canEdit) return
    onActivity?.()

    const stage = stageRef.current
    if (!stage) return

    const obj = objects.get(id)
    if (!obj) return

    const textRect = textNode.getClientRect()

    setEditingId(id)
    setEditingField('text')
    setEditingCellCoords({ row, col })

    // Get cell text from table_data (row === -1 means column header)
    let initialText = ''
    if (obj.table_data) {
      try {
        const data = typeof obj.table_data === 'string' ? JSON.parse(obj.table_data) : obj.table_data
        if (row === -1) {
          initialText = data.columns?.[col]?.name ?? ''
        } else {
          const colId = data.columns?.[col]?.id
          initialText = data.rows?.[row]?.cells?.[colId]?.text ?? ''
        }
      } catch { /* empty */ }
    }
    setEditText(initialText)

    setTextareaStyle({
      ...TEXTAREA_BASE_STYLE,
      top: `${textRect.y}px`,
      left: `${textRect.x}px`,
      width: `${textRect.width}px`,
      height: `${textRect.height}px`,
      fontSize: `${(obj.font_size || 14) * stageScale}px`,
      fontFamily: obj.font_family || 'sans-serif',
      fontWeight: row === -1 ? 'bold' : 'normal',
      fontStyle: 'normal',
      textAlign: 'left',
      color: obj.text_color ?? '#000000',
      lineHeight: '1.2',
    })
  }, [objects, stageScale, canEdit, onActivity])

  const handleCellKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!editingId || !editingCellCoords) return

    const obj = objects.get(editingId)
    if (!obj?.table_data) return

    const data = parseTableData(obj.table_data)
    if (!data) return

    // Header rows don't support cell navigation
    if (editingCellCoords.row === -1) {
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        handleFinishEdit()
      }
      return
    }

    let direction: 'right' | 'left' | 'down' | 'up' | null = null
    if (e.key === 'Tab' && !e.shiftKey) { direction = 'right'; e.preventDefault() }
    else if (e.key === 'Tab' && e.shiftKey) { direction = 'left'; e.preventDefault() }
    else if (e.key === 'Enter' && !e.shiftKey) { direction = 'down'; e.preventDefault() }
    else if (e.key === 'Escape') {
      handleFinishEdit()
      return
    }

    if (!direction) return

    const { row, col } = editingCellCoords
    const next = nextCell(data, row, col, direction)

    // Save current cell first
    if (onUpdateTableCell) {
      onUpdateTableCell(editingId, editingCellCoords.row, editingCellCoords.col, editText)
    }

    if (next) {
      // Navigate to next cell
      setEditingCellCoords(next)
      const colId = data.columns[next.col]?.id
      const cellText = data.rows[next.row]?.cells?.[colId]?.text ?? ''
      setEditText(cellText)
    } else {
      // At boundary: cell was already saved above; signal handleFinishEdit to skip
      cellAlreadySavedRef.current = true
      handleFinishEdit()
    }
  }, [editingId, editingCellCoords, objects, editText, onUpdateTableCell, handleFinishEdit])

  // Double-click handler for non-text shapes — only enters group, records for triple-click
  const handleShapeDoubleClick = useCallback((id: string) => {
    if (tryEnterGroup(id)) return
    // Record for triple-click detection (geometric shapes use triple-click to edit text)
    lastDblClickRef.current = { id, time: Date.now() }
  }, [tryEnterGroup])

  // Start text editing on a geometric shape (used by triple-click)
  const startGeometricTextEdit = useCallback((id: string) => {
    const obj = objects.get(id)
    if (!obj || !canEdit) return
    const konvaNode = shapeRefs.current.get(id)
    if (!konvaNode) return
    const textNode = (konvaNode as Konva.Group).findOne?.('Text') as Konva.Text | undefined
    if (textNode) {
      handleStartEdit(id, textNode)
    } else {
      // Shape has no text yet — add empty text so re-render creates the Text node
      onUpdateText(id, ' ')
      setTimeout(() => {
        const node = shapeRefs.current.get(id)
        const tn = (node as Konva.Group)?.findOne?.('Text') as Konva.Text | undefined
        if (tn) handleStartEdit(id, tn)
      }, 50)
    }
  }, [objects, canEdit, handleStartEdit, onUpdateText])

  // ── Effects ────────────────────────────────────────────────────────

  // Focus textarea when editing starts
  useEffect(() => {
    if (editingId && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [editingId])

  // Sync textarea style live when font/text properties change during editing.
  // Debounced (50ms) to avoid recalc on every zoom tick.
  useEffect(() => {
    if (!editingId) return
    const obj = objects.get(editingId)
    if (!obj) return
    const timer = setTimeout(() => {
      const fontFamily = obj.font_family || 'sans-serif'
      const fontStyle = obj.font_style || 'normal'
      const isBold = fontStyle === 'bold' || fontStyle === 'bold italic'
      const isItalic = fontStyle === 'italic' || fontStyle === 'bold italic'
      const textColor = editingField === 'title' ? (obj.text_color ?? '#374151') : (obj.text_color ?? '#000000')
      const textAlign = (obj.text_align ?? (obj.type === 'sticky_note' ? 'left' : 'center')) as React.CSSProperties['textAlign']
      const fontSize = editingField === 'title' ? 14 : obj.font_size
      setTextareaStyle(prev => ({
        ...prev,
        fontFamily,
        fontWeight: isBold || editingField === 'title' ? 'bold' : 'normal',
        fontStyle: isItalic ? 'italic' : 'normal',
        color: textColor,
        textAlign,
        fontSize: `${fontSize * stageScale}px`,
      }))
    }, 50)
    return () => clearTimeout(timer)
  }, [editingId, editingField, objects, stageScale])

  // Notify parent when editing state changes
  useEffect(() => {
    onEditingChange?.(!!editingId)
  }, [editingId, onEditingChange])

  // Auto-enter text edit mode for newly created text boxes.
  // Polls via rAF until the Konva node exists (up to 500ms), then triggers edit.
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
    editingCellCoords,
    editText,
    setEditText,
    textareaStyle,
    textareaRef,
    handleStartEdit,
    handleStartCellEdit,
    handleFinishEdit,
    handleShapeDoubleClick,
    handleCellKeyDown,
    startGeometricTextEdit,
    lastDblClickRef,
  }
}
