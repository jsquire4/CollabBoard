import React, { useMemo } from 'react'
import { BoardObject } from '@/types/board'
import { ContextMenu } from './ContextMenu'
import { SelectionBar } from './SelectionBar'
import { ApiObjectOverlay } from './ApiObjectOverlay'
import { getTextCharLimit, STICKY_TITLE_CHAR_LIMIT } from '@/hooks/board/useTextEditing'
import { RICH_TEXT_ENABLED } from '@/lib/richText'
import type { ContextMenuState } from '@/hooks/board/useContextMenu'
import { useDrawInteraction, ConnectorHintData, ConnectorDrawingRefs } from '@/hooks/board/useDrawInteraction'

interface CanvasOverlaysProps {
  // Textarea editing
  editingId: string | null
  editingField?: 'title' | 'text'
  editText: string
  setEditText: (text: string) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  textareaStyle: React.CSSProperties
  handleFinishEdit: () => void
  onUpdateText: (id: string, text: string) => void
  onUpdateTitle: (id: string, title: string) => void
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
  editingId, editingField, editText, setEditText, textareaRef, textareaStyle,
  handleFinishEdit, onUpdateText, onUpdateTitle, objects,
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
      {/* Textarea overlay for editing text (skip for rich text body editing — handled by TipTapEditorOverlay).
          Always shown for table cell editing regardless of RICH_TEXT_ENABLED. */}
      {editingId && (!RICH_TEXT_ENABLED || editingField === 'title' || isCellEditing) && (
        <textarea
          ref={textareaRef}
          value={editText}
          maxLength={editingField === 'title' ? STICKY_TITLE_CHAR_LIMIT : (editingId ? getTextCharLimit(objects.get(editingId)?.type ?? '') : undefined)}
          onChange={e => {
            let value = e.target.value
            if (editingField === 'title') {
              value = value.slice(0, STICKY_TITLE_CHAR_LIMIT)
            } else if (editingId) {
              const limit = getTextCharLimit(objects.get(editingId)?.type ?? '')
              if (limit !== undefined) {
                value = value.slice(0, limit)
              }
            }
            setEditText(value)
            if (editingId) {
              if (editingField === 'title') {
                onUpdateTitle(editingId, value)
              } else {
                onUpdateText(editingId, value)
              }
            }
          }}
          onBlur={handleFinishEdit}
          onKeyDown={e => {
            if (onCellKeyDown) onCellKeyDown(e)
            if (e.key === 'Escape') handleFinishEdit()
          }}
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
