import React from 'react'
import type Konva from 'konva'
import { BoardObject } from '@/types/board'
import { StickyNote } from './StickyNote'
import { FrameShape } from './FrameShape'
import { GenericShape } from './GenericShape'
import { VectorShape } from './VectorShape'
import { TableShape } from './TableShape'
import { shapeRegistry } from './shapeRegistry'

export interface ShapeCallbacks {
  handleShapeDragEnd: (id: string, x: number, y: number) => void
  handleShapeDragMove: (id: string, x: number, y: number) => void
  handleShapeDragStart: (id: string) => void
  handleShapeSelect: (id: string) => void
  handleShapeRef: (id: string, node: Konva.Node | null) => void
  onTransformEnd: (id: string, updates: Partial<BoardObject>) => void
  handleContextMenu: (id: string, clientX: number, clientY: number) => void
  handleShapeDoubleClick: (id: string) => void
  handleStartEdit: (id: string, textNode: Konva.Text, field?: 'title' | 'text') => void
  shapeDragBoundFunc?: (pos: { x: number; y: number }) => { x: number; y: number }
  onEndpointDragMove?: (id: string, updates: Partial<BoardObject>) => void
  onEndpointDragEnd?: (id: string, updates: Partial<BoardObject>) => void
  onWaypointDragEnd?: (id: string, waypointIndex: number, x: number, y: number) => void
  onWaypointInsert?: (id: string, afterSegmentIndex: number) => void
  onWaypointDelete?: (id: string, waypointIndex: number) => void
  getAutoRoutePoints: (obj: BoardObject) => number[] | null
  autoRoutePointsRef?: React.MutableRefObject<Map<string, number[]>>
  handleStartCellEdit?: (id: string, textNode: Konva.Text, row: number, col: number) => void
  handleTableDataChange?: (id: string, tableData: string) => void
}

export interface ShapeState {
  selectedIds: Set<string>
  isObjectLocked: (id: string) => boolean
  canEdit: boolean
  editingId: string | null
  editingField?: 'title' | 'text'
  editingCellCoords?: { row: number; col: number } | null
}

export function renderShape(
  obj: BoardObject,
  state: ShapeState,
  callbacks: ShapeCallbacks,
): React.ReactNode {
  const { selectedIds, isObjectLocked, canEdit, editingId, editingField, editingCellCoords } = state
  const {
    handleShapeDragEnd, handleShapeDragMove, handleShapeDragStart,
    handleShapeSelect, handleShapeRef, onTransformEnd, handleContextMenu,
    handleShapeDoubleClick, handleStartEdit, shapeDragBoundFunc,
    onEndpointDragMove, onEndpointDragEnd,
    onWaypointDragEnd, onWaypointInsert, onWaypointDelete,
    getAutoRoutePoints, autoRoutePointsRef,
    handleStartCellEdit, handleTableDataChange,
  } = callbacks

  const isSelected = selectedIds.has(obj.id)
  const shapeLocked = isObjectLocked(obj.id)
  const shapeEditable = canEdit && !shapeLocked

  // Registry shapes (rectangle, circle, triangle, chevron, parallelogram)
  if (shapeRegistry.has(obj.type)) {
    return (
      <GenericShape
        key={obj.id}
        object={obj}
        onDragEnd={handleShapeDragEnd}
        onDragMove={handleShapeDragMove}
        onDragStart={handleShapeDragStart}
        isSelected={isSelected}
        onSelect={handleShapeSelect}
        shapeRef={handleShapeRef}
        onTransformEnd={onTransformEnd}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleShapeDoubleClick}
        isEditing={editingId === obj.id}
        editable={shapeEditable}
        dragBoundFunc={shapeDragBoundFunc}
      />
    )
  }

  switch (obj.type) {
    case 'sticky_note':
      return (
        <StickyNote
          key={obj.id}
          object={obj}
          onDragEnd={handleShapeDragEnd}
          onDragMove={handleShapeDragMove}
          onDragStart={handleShapeDragStart}
          isSelected={isSelected}
          onSelect={handleShapeSelect}
          onStartEdit={handleStartEdit}
          shapeRef={handleShapeRef}
          onTransformEnd={onTransformEnd}
          onContextMenu={handleContextMenu}
          editable={shapeEditable}
          dragBoundFunc={shapeDragBoundFunc}
          isEditing={editingId === obj.id}
          editingField={editingId === obj.id ? editingField : undefined}
        />
      )
    case 'frame':
      return (
        <FrameShape
          key={obj.id}
          object={obj}
          onDragEnd={handleShapeDragEnd}
          onDragMove={handleShapeDragMove}
          onDragStart={handleShapeDragStart}
          isSelected={isSelected}
          onSelect={handleShapeSelect}
          onStartEdit={handleStartEdit}
          shapeRef={handleShapeRef}
          onTransformEnd={onTransformEnd}
          onContextMenu={handleContextMenu}
          editable={shapeEditable}
          dragBoundFunc={shapeDragBoundFunc}
          isEditing={editingId === obj.id}
        />
      )
    case 'line':
    case 'arrow': {
      const autoRoutePoints = getAutoRoutePoints(obj)
      // Populate ref so BoardClient can use auto-route points for waypoint insertion
      if (autoRoutePointsRef) {
        if (autoRoutePoints) {
          autoRoutePointsRef.current.set(obj.id, autoRoutePoints)
        } else {
          autoRoutePointsRef.current.delete(obj.id)
        }
      }
      return (
        <VectorShape
          key={obj.id}
          variant={obj.type as 'line' | 'arrow'}
          object={obj}
          onDragEnd={handleShapeDragEnd}
          onDragMove={handleShapeDragMove}
          onDragStart={handleShapeDragStart}
          isSelected={isSelected}
          onSelect={handleShapeSelect}
          shapeRef={handleShapeRef}
          onTransformEnd={onTransformEnd}
          onContextMenu={handleContextMenu}
          editable={shapeEditable}
          dragBoundFunc={shapeDragBoundFunc}
          onEndpointDragMove={onEndpointDragMove}
          onEndpointDragEnd={onEndpointDragEnd}
          autoRoutePoints={autoRoutePoints}
          onWaypointDragEnd={onWaypointDragEnd}
          onWaypointInsert={onWaypointInsert}
          onWaypointDelete={onWaypointDelete}
        />
      )
    }
    case 'table':
      return (
        <TableShape
          key={obj.id}
          object={obj}
          onDragEnd={handleShapeDragEnd}
          onDragMove={handleShapeDragMove}
          onDragStart={handleShapeDragStart}
          isSelected={isSelected}
          onSelect={handleShapeSelect}
          shapeRef={handleShapeRef}
          onTransformEnd={onTransformEnd}
          onContextMenu={handleContextMenu}
          editable={shapeEditable}
          dragBoundFunc={shapeDragBoundFunc}
          isEditing={editingId === obj.id}
          editingCellCoords={editingId === obj.id ? editingCellCoords : null}
          onStartCellEdit={handleStartCellEdit}
          onTableDataChange={handleTableDataChange}
        />
      )
    case 'group':
      return null
    default: {
      const _exhaustive: never = obj.type as never
      void _exhaustive
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[renderShape] Unhandled shape type: ${obj.type}`)
      }
      return null
    }
  }
}
