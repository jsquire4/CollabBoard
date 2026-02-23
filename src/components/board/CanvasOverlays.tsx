import React, { useMemo, useRef, useEffect } from 'react'
import { BoardObject } from '@/types/board'
import { ContextMenu } from './ContextMenu'
import { SelectionBar } from './SelectionBar'
import { ApiObjectOverlay } from './ApiObjectOverlay'
import { getTextCharLimit } from '@/hooks/board/useTextEditing'
import type { ContextMenuState } from '@/hooks/board/useContextMenu'
import { useDrawInteraction, ConnectorHintData, ConnectorDrawingRefs } from '@/hooks/board/useDrawInteraction'

/** Table cell textarea — stays open when clicking text styles menu ([data-keeps-rich-text-alive]).
 * Uses mousedown for click-outside (primary). onBlur deferred check handles tab-away. */
function TableCellTextarea({
  textareaRef,
  value,
  maxLength,
  onChange,
  onFinish,
  onCellKeyDown,
  style,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  value: string
  maxLength?: number
  onChange: (value: string) => void
  onFinish: () => void
  onCellKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  style: React.CSSProperties
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)

  const handleBlur = () => {
    requestAnimationFrame(() => {
      const active = document.activeElement
      if (wrapperRef.current?.contains(active)) return
      if (active && (active as HTMLElement).closest?.('[data-keeps-rich-text-alive]')) return
      onFinish()
    })
  }

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (wrapperRef.current?.contains(target)) return
      if ((target as HTMLElement).closest?.('[data-keeps-rich-text-alive]')) return
      onFinish()
    }
    let listenerAdded = false
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleMouseDown, true)
      listenerAdded = true
    }, 100)
    return () => {
      clearTimeout(timer)
      if (listenerAdded) document.removeEventListener('mousedown', handleMouseDown, true)
    }
  }, [onFinish])

  return (
    <div ref={wrapperRef} role="group" className="pointer-events-auto" onMouseDown={e => e.stopPropagation()}>
      <textarea
        ref={textareaRef}
        value={value}
        maxLength={maxLength}
        onChange={e => {
          let v = e.target.value
          if (maxLength !== undefined) v = v.slice(0, maxLength)
          onChange(v)
        }}
        onBlur={handleBlur}
        onKeyDown={e => {
          if (onCellKeyDown) onCellKeyDown(e)
          if (e.key === 'Escape') onFinish()
        }}
        style={style}
      />
    </div>
  )
}

interface CanvasOverlaysProps {
  // Textarea editing (table cell editing only — title/body use TipTapEditorOverlay)
  editingId: string | null
  editText: string
  setEditText: (text: string) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  textareaStyle: React.CSSProperties
  handleFinishEdit: () => void
  onUpdateText: (id: string, text: string) => void
  objects: Map<string, BoardObject>

  // Connector hint
  connectorHint: ConnectorHintData | null
  stageScale: number
  stagePos: { x: number; y: number }
  connectorDrawingRefs: ConnectorDrawingRefs

  // Context menu
  contextMenu: ContextMenuState | null
  setContextMenu: (m: ContextMenuState | null) => void
  onCellKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void

  // Rich text
  isEditingText?: boolean
  richTextEditor?: import('@tiptap/react').Editor | null
  isCellEditing?: boolean

  // API object overlays
  boardId?: string
  onApiConfigChange?: (id: string, formula: string) => void
}

export function CanvasOverlays({
  editingId, editText, setEditText, textareaRef, textareaStyle,
  handleFinishEdit, onUpdateText, objects,
  connectorHint, stageScale, stagePos, connectorDrawingRefs,
  contextMenu, setContextMenu,
  onCellKeyDown,
  isEditingText, richTextEditor,
  isCellEditing,
  boardId, onApiConfigChange,
}: CanvasOverlaysProps) {
  const { handleConnectorHintMouseDown } = useDrawInteraction({ connectorHint, connectorDrawingRefs })

  const apiObjects = useMemo(() => {
    if (!boardId || !onApiConfigChange) return []
    return [...objects.values()].filter(o => o.type === 'api_object' && !o.deleted_at)
  }, [objects, boardId, onApiConfigChange])

  return (
    <>
      {/* API object HTML overlays — single scaled container for all */}
      {apiObjects.length > 0 && (
        <div
          className="absolute top-0 left-0"
          style={{
            transform: `translate(${stagePos.x}px, ${stagePos.y}px) scale(${stageScale})`,
            transformOrigin: '0 0',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          {apiObjects.map(obj => (
            <ApiObjectOverlay
              key={`api-overlay-${obj.id}`}
              object={obj}
              boardId={boardId!}
              onConfigChange={onApiConfigChange!}
            />
          ))}
        </div>
      )}
      {/* Textarea overlay for table cell editing.
          Body and title text editing is handled by TipTapEditorOverlay.
          onBlur: don't close when focus moves to text styles menu ([data-keeps-rich-text-alive]). */}
      {editingId && isCellEditing && (
        <TableCellTextarea
          textareaRef={textareaRef}
          value={editText}
          maxLength={editingId ? getTextCharLimit(objects.get(editingId)?.type ?? '') : undefined}
          onChange={value => {
            setEditText(value)
            if (editingId) onUpdateText(editingId, value)
          }}
          onFinish={handleFinishEdit}
          onCellKeyDown={onCellKeyDown}
          style={textareaStyle}
        />
      )}

      {/* Connector hint — dashed anchor circles on shape edges */}
      {connectorHint && connectorHint.allAnchors.map(anchor => {
        const dotSize = Math.max(10, 14 * stageScale)
        const screenX = anchor.x * stageScale + stagePos.x
        const screenY = anchor.y * stageScale + stagePos.y
        return (
          <button
            key={`hint-${anchor.id}`}
            type="button"
            className="pointer-events-auto absolute z-50 rounded-full transition-colors hover:bg-navy/30"
            style={{
              left: screenX - dotSize / 2,
              top: screenY - dotSize / 2,
              width: dotSize,
              height: dotSize,
              backgroundColor: 'rgba(120, 120, 120, 0.25)',
              border: '1.5px dashed rgba(70, 70, 70, 0.75)',
            }}
            title="Draw connector"
            onMouseDown={e => handleConnectorHintMouseDown(e, anchor)}
          />
        )
      })}

      {/* Selection bar (replaces FloatingPropertyPanel) */}
      <SelectionBar stagePos={stagePos} stageScale={stageScale} isEditingText={isEditingText} richTextEditor={richTextEditor} />

      {/* Right-click context menu */}
      {contextMenu && (
        <ContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          objectId={contextMenu.objectId}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  )
}
