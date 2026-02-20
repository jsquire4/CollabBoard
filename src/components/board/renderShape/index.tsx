import React from 'react'
import { BoardObject, VectorObject, TableObject } from '@/types/board'
import { AgentObject } from '@/types/boardObject'
import { StickyNote } from '../StickyNote'
import { FrameShape } from '../FrameShape'
import { GenericShape } from '../GenericShape'
import { VectorShape } from '../VectorShape'
import { TableShape } from '../TableShape'
import { AgentShape } from '../AgentShape'
import { ContextObjectShape } from '../ContextObjectShape'
import { shapeRegistry } from '../shapeRegistry'
import { ShapeCallbacks, ShapeState } from './types'

export type { ShapeCallbacks, ShapeState, BaseShapeCallbacks, VectorShapeCallbacks, TableShapeCallbacks, AgentShapeCallbacks } from './types'

const noop = () => {}

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
    handleAddRowAt, handleDeleteRowAt, handleAddColumnAt, handleDeleteColumnAt,
    onAgentClick,
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
    case 'arrow':
    case 'data_connector': {
      const autoRoutePoints = getAutoRoutePoints ? getAutoRoutePoints(obj) : null
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
          variant={obj.type as 'line' | 'arrow' | 'data_connector'}
          object={obj as VectorObject}
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
          object={obj as TableObject}
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
          onAddRowAt={handleAddRowAt}
          onDeleteRowAt={handleDeleteRowAt}
          onAddColumnAt={handleAddColumnAt}
          onDeleteColumnAt={handleDeleteColumnAt}
        />
      )
    case 'agent':
      return (
        <AgentShape
          key={obj.id}
          object={obj as AgentObject}
          onDragEnd={handleShapeDragEnd}
          onDragMove={handleShapeDragMove}
          onDragStart={handleShapeDragStart}
          isSelected={isSelected}
          onSelect={handleShapeSelect}
          shapeRef={handleShapeRef}
          onTransformEnd={onTransformEnd}
          onContextMenu={handleContextMenu}
          onDoubleClick={handleShapeDoubleClick}
          editable={shapeEditable}
          dragBoundFunc={shapeDragBoundFunc}
          onAgentClick={onAgentClick ?? noop}
        />
      )
    case 'context_object':
      return (
        <ContextObjectShape
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
        />
      )
    case 'group':
    case 'file':
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
