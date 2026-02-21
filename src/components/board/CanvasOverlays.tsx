import React from 'react'
import { BoardObject } from '@/types/board'
import { ContextMenu } from './ContextMenu'
import { FloatingPropertyPanel } from './FloatingPropertyPanel'
import { ZoomControls } from './ZoomControls'
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

  // Zoom
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void

  // Context menu
  contextMenu: ContextMenuState | null
  setContextMenu: (m: ContextMenuState | null) => void
  recentColors?: string[]
  onCellKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
}

export function CanvasOverlays({
  editingId, editingField, editText, setEditText, textareaRef, textareaStyle,
  handleFinishEdit, onUpdateText, onUpdateTitle, objects,
  connectorHint, stageScale, stagePos, connectorDrawingRefs,
  zoomIn, zoomOut, resetZoom,
  contextMenu, setContextMenu, recentColors,
  onCellKeyDown,
}: CanvasOverlaysProps) {
  const { handleConnectorHintMouseDown } = useDrawInteraction({ connectorHint, connectorDrawingRefs })

  return (
    <>
      {/* Textarea overlay for editing text (skip for rich text body editing — handled by TipTapEditorOverlay) */}
      {editingId && !(RICH_TEXT_ENABLED && editingField !== 'title') && (
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

      {/* Connector hint — floating button near shape edge */}
      {connectorHint && (() => {
        const hintScreenX = connectorHint.anchor.x * stageScale + stagePos.x
        const hintScreenY = connectorHint.anchor.y * stageScale + stagePos.y
        return (
        <button
          type="button"
          className="pointer-events-auto absolute z-50 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white shadow-lg transition hover:bg-blue-600"
          style={{
            left: hintScreenX - 12,
            top: hintScreenY - 12,
          }}
          title="Draw connector"
          onMouseDown={handleConnectorHintMouseDown}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
        )
      })()}

      {/* Floating property panel */}
      <FloatingPropertyPanel stagePos={stagePos} stageScale={stageScale} />

      {/* Zoom controls */}
      <div className="pointer-events-auto absolute bottom-4 right-4 z-50">
        <ZoomControls
          scale={stageScale}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onReset={resetZoom}
        />
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <ContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          objectId={contextMenu.objectId}
          onClose={() => setContextMenu(null)}
          recentColors={recentColors}
        />
      )}
    </>
  )
}
