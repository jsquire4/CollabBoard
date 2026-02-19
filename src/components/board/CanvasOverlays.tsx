import React from 'react'
import { BoardObject } from '@/types/board'
import { ContextMenu } from './ContextMenu'
import { ZoomControls } from './ZoomControls'
import { getTextCharLimit, STICKY_TITLE_CHAR_LIMIT } from '@/hooks/board/useTextEditing'
import type { ContextMenuState } from '@/hooks/board/useContextMenu'

interface ConnectorHintData {
  shapeId: string
  anchor: { id: string; x: number; y: number }
}

interface ConnectorDrawingRefs {
  drawSnapStartRef: React.MutableRefObject<{ shapeId: string; anchorId: string; x: number; y: number } | null>
  connectorHintDrawingRef: React.MutableRefObject<boolean>
  drawIsLineRef: React.MutableRefObject<boolean>
  isDrawing: React.MutableRefObject<boolean>
  drawStart: React.MutableRefObject<{ x: number; y: number } | null>
  setDrawPreview: (p: { x: number; y: number; width: number; height: number } | null) => void
  setLinePreview: (p: { x1: number; y1: number; x2: number; y2: number } | null) => void
  setConnectorHint: (h: ConnectorHintData | null) => void
}

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
  uiDarkMode: boolean

  // Context menu
  contextMenu: ContextMenuState | null
  setContextMenu: (m: ContextMenuState | null) => void
  onDelete: () => void
  onDuplicate: () => void
  onColorChange: (color: string) => void
  recentColors?: string[]
  colors: string[]
  selectedColor?: string
  onStrokeStyleChange?: (updates: { stroke_color?: string | null; stroke_width?: number; stroke_dash?: string }) => void
  onOpacityChange?: (opacity: number) => void
  handleCtxBringToFront: () => void
  handleCtxBringForward: () => void
  handleCtxSendBackward: () => void
  handleCtxSendToBack: () => void
  onGroup: () => void
  onUngroup: () => void
  canGroup: boolean
  canUngroup: boolean
  isObjectLocked: (id: string) => boolean
  onLock?: () => void
  onUnlock?: () => void
  canLock?: boolean
  canUnlock?: boolean
  onEditVertices?: () => void
  canEditVertices?: boolean
  onMarkerChange?: (updates: { marker_start?: string; marker_end?: string }) => void
  onAddRow?: () => void
  onDeleteRow?: () => void
  onAddColumn?: () => void
  onDeleteColumn?: () => void
  onCellKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
}

export function CanvasOverlays({
  editingId, editingField, editText, setEditText, textareaRef, textareaStyle,
  handleFinishEdit, onUpdateText, onUpdateTitle, objects,
  connectorHint, stageScale, stagePos, connectorDrawingRefs,
  zoomIn, zoomOut, resetZoom, uiDarkMode,
  contextMenu, setContextMenu, onDelete, onDuplicate, onColorChange,
  recentColors, colors, selectedColor,
  onStrokeStyleChange, onOpacityChange,
  handleCtxBringToFront, handleCtxBringForward, handleCtxSendBackward, handleCtxSendToBack,
  onGroup, onUngroup, canGroup, canUngroup,
  isObjectLocked, onLock, onUnlock, canLock, canUnlock,
  onEditVertices, canEditVertices, onMarkerChange,
  onAddRow, onDeleteRow, onAddColumn, onDeleteColumn,
  onCellKeyDown,
}: CanvasOverlaysProps) {
  return (
    <>
      {/* Textarea overlay for editing text */}
      {editingId && (
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
        const {
          drawSnapStartRef, connectorHintDrawingRef, drawIsLineRef,
          isDrawing, drawStart, setDrawPreview, setLinePreview, setConnectorHint,
        } = connectorDrawingRefs
        return (
        <button
          type="button"
          className="pointer-events-auto absolute z-50 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white shadow-lg transition hover:bg-blue-600"
          style={{
            left: hintScreenX - 12,
            top: hintScreenY - 12,
          }}
          title="Draw connector"
          onMouseDown={(ev) => {
            ev.stopPropagation()
            // Pre-store anchor and activate connector drawing
            drawSnapStartRef.current = {
              shapeId: connectorHint.shapeId,
              anchorId: connectorHint.anchor.id,
              x: connectorHint.anchor.x,
              y: connectorHint.anchor.y,
            }
            connectorHintDrawingRef.current = true
            drawIsLineRef.current = true
            setConnectorHint(null)
            drawStart.current = { x: connectorHint.anchor.x, y: connectorHint.anchor.y }
            isDrawing.current = true
            setDrawPreview({ x: connectorHint.anchor.x, y: connectorHint.anchor.y, width: 0, height: 0 })
            const cleanup = () => {
              // If Konva's mouseUp already handled it, these are no-ops
              isDrawing.current = false
              drawStart.current = null
              drawSnapStartRef.current = null
              connectorHintDrawingRef.current = false
              drawIsLineRef.current = false
              setDrawPreview(null)
              setLinePreview(null)
              window.removeEventListener('mouseup', cleanup)
            }
            window.addEventListener('mouseup', cleanup, { once: true })
          }}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
        )
      })()}

      {/* Zoom controls */}
      <div className="pointer-events-auto absolute bottom-4 right-4 z-50">
        <ZoomControls
          scale={stageScale}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onReset={resetZoom}
          uiDarkMode={uiDarkMode}
        />
      </div>

      {/* Right-click context menu */}
      {contextMenu && (() => {
        const ctxObj = objects.get(contextMenu.objectId)
        const isLine = ctxObj?.type === 'line' || ctxObj?.type === 'arrow'
        const isTableObj = ctxObj?.type === 'table'
        return (
        <ContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onColorChange={onColorChange}
          onClose={() => setContextMenu(null)}
          recentColors={recentColors}
          colors={colors}
          currentColor={selectedColor}
          isLine={isLine}
          onStrokeStyleChange={onStrokeStyleChange}
          onOpacityChange={onOpacityChange}
          currentStrokeWidth={ctxObj?.stroke_width}
          currentStrokeDash={ctxObj?.stroke_dash}
          currentStrokeColor={ctxObj?.stroke_color}
          currentOpacity={ctxObj?.opacity ?? 1}
          onBringToFront={handleCtxBringToFront}
          onBringForward={handleCtxBringForward}
          onSendBackward={handleCtxSendBackward}
          onSendToBack={handleCtxSendToBack}
          onGroup={onGroup}
          onUngroup={onUngroup}
          canGroup={canGroup}
          canUngroup={canUngroup}
          isLocked={isObjectLocked(contextMenu.objectId)}
          onLock={() => { onLock?.(); setContextMenu(null) }}
          onUnlock={() => { onUnlock?.(); setContextMenu(null) }}
          canLockShape={canLock}
          canUnlockShape={canUnlock}
          onEditVertices={onEditVertices}
          canEditVertices={canEditVertices}
          onMarkerChange={onMarkerChange}
          currentMarkerStart={ctxObj?.marker_start ?? (ctxObj?.type === 'arrow' ? 'arrow' : 'none')}
          currentMarkerEnd={ctxObj?.marker_end ?? (ctxObj?.type === 'arrow' ? 'arrow' : 'none')}
          isTable={isTableObj}
          onAddRow={onAddRow}
          onDeleteRow={onDeleteRow}
          onAddColumn={onAddColumn}
          onDeleteColumn={onDeleteColumn}
        />
        )
      })()}
    </>
  )
}
