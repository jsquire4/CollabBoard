import { useCallback, useMemo, useRef, type MutableRefObject } from 'react'
import { BoardObject, BoardObjectType } from '@/types/board'
import { UndoEntry } from '@/hooks/useUndoStack'
import { isVectorType } from '@/components/board/shapeUtils'
import { getShapeAnchors, findNearestAnchor, AnchorPoint } from '@/components/board/anchorPoints'
import { parseWaypoints, computeAutoRoute } from '@/components/board/autoRoute'

const SNAP_DISTANCE = 20

/**
 * Pick the best anchor on a shape for a connector endpoint.
 * Uses the connector's OTHER endpoint as reference and picks the nearest anchor.
 * Returns null for self-loop connectors (both ends on same shape).
 */
export function pickBestAnchor(
  connector: BoardObject,
  endpoint: 'start' | 'end',
  anchors: AnchorPoint[],
  otherEndpoint?: { x: number; y: number }
): { x: number; y: number; anchorId: string } | null {
  if (anchors.length === 0) return null
  if (connector.connect_start_id && connector.connect_start_id === connector.connect_end_id) return null
  const refX = otherEndpoint?.x ?? (endpoint === 'start' ? (connector.x2 ?? connector.x + connector.width) : connector.x)
  const refY = otherEndpoint?.y ?? (endpoint === 'start' ? (connector.y2 ?? connector.y + connector.height) : connector.y)
  const best = findNearestAnchor(anchors, refX, refY, Infinity)
  if (!best) return null
  return { x: best.x, y: best.y, anchorId: best.id }
}

interface UseConnectorActionsDeps {
  objects: Map<string, BoardObject>
  canEdit: boolean
  updateObject: (id: string, updates: Partial<BoardObject>) => void
  updateObjectDrag: (id: string, updates: Partial<BoardObject>, opts?: { skipOverlay?: boolean }) => void
  updateConnectorDrag: (id: string, updates: Partial<BoardObject>) => void
  updateObjectDragEnd: (id: string, updates: Partial<BoardObject>) => void
  addObject: (type: BoardObjectType, x: number, y: number, overrides?: Partial<BoardObject>) => BoardObject | null
  checkFrameContainment: (id: string) => void
  undoStack: {
    push: (entry: UndoEntry) => void
  }
  markActivity: () => void
  setSnapIndicator: (indicator: { x: number; y: number } | null) => void
  setShapePalette: (palette: { lineId: string; canvasX: number; canvasY: number; screenX?: number; screenY?: number } | null) => void
  shapePalette: { lineId: string; canvasX: number; canvasY: number; screenX?: number; screenY?: number } | null
  autoRoutePointsRef: MutableRefObject<Map<string, number[]>>
  waitForPersist: (id: string) => Promise<boolean>
}

export function useConnectorActions({
  objects,
  canEdit,
  updateObject,
  updateObjectDrag,
  updateConnectorDrag,
  updateObjectDragEnd,
  addObject,
  checkFrameContainment,
  undoStack,
  markActivity,
  setSnapIndicator,
  setShapePalette,
  shapePalette,
  autoRoutePointsRef,
  waitForPersist,
}: UseConnectorActionsDeps) {
  // --- Connection index ---
  const connectionIndexRef = useRef<Map<string, Array<{ connectorId: string; endpoint: 'start' | 'end' }>>>(new Map())
  const connectionSigRef = useRef('')

  const connectionIndex = useMemo(() => {
    const sigParts: string[] = []
    for (const [id, obj] of objects) {
      if (!isVectorType(obj.type)) continue
      if (obj.connect_start_id || obj.connect_end_id) {
        sigParts.push(`${id}:${obj.connect_start_id ?? ''}:${obj.connect_end_id ?? ''}`)
      }
    }
    const sig = sigParts.join('|')
    if (sig === connectionSigRef.current) return connectionIndexRef.current

    const index = new Map<string, Array<{ connectorId: string; endpoint: 'start' | 'end' }>>()
    for (const [id, obj] of objects) {
      if (!isVectorType(obj.type)) continue
      if (obj.connect_start_id) {
        const list = index.get(obj.connect_start_id) ?? []
        list.push({ connectorId: id, endpoint: 'start' })
        index.set(obj.connect_start_id, list)
      }
      if (obj.connect_end_id) {
        const list = index.get(obj.connect_end_id) ?? []
        list.push({ connectorId: id, endpoint: 'end' })
        index.set(obj.connect_end_id, list)
      }
    }
    connectionIndexRef.current = index
    connectionSigRef.current = sig
    return index
  }, [objects])

  const followConnectors = useCallback((
    shapeId: string,
    anchors: AnchorPoint[],
    updateFn: (id: string, updates: Partial<BoardObject>) => void,
    commitAnchor: boolean
  ) => {
    const anchorMap = new Map(anchors.map(a => [a.id, a]))
    const connections = connectionIndex.get(shapeId)
    if (!connections) return
    for (const { connectorId, endpoint } of connections) {
      const connector = objects.get(connectorId)
      if (!connector) continue
      if (connector.connect_start_id && connector.connect_start_id === connector.connect_end_id) {
        const updates: Partial<BoardObject> = { waypoints: null }
        const startAnchorId = connector.connect_start_anchor
        const endAnchorId = connector.connect_end_anchor
        if (startAnchorId) {
          const a = anchorMap.get(startAnchorId)
          if (a) { updates.x = a.x; updates.y = a.y }
        }
        if (endAnchorId) {
          const a = anchorMap.get(endAnchorId)
          if (a) { updates.x2 = a.x; updates.y2 = a.y }
        }
        updateFn(connectorId, updates)
        continue
      }
      const otherEnd = endpoint === 'start'
        ? { x: connector.x2 ?? connector.x + connector.width, y: connector.y2 ?? connector.y + connector.height }
        : { x: connector.x, y: connector.y }
      const best = pickBestAnchor(connector, endpoint, anchors, otherEnd)
      if (!best) {
        const anchorId = endpoint === 'start' ? connector.connect_start_anchor : connector.connect_end_anchor
        if (!anchorId) continue
        const anchor = anchorMap.get(anchorId)
        if (!anchor) continue
        if (endpoint === 'start') {
          updateFn(connectorId, { x: anchor.x, y: anchor.y, waypoints: null })
        } else {
          updateFn(connectorId, { x2: anchor.x, y2: anchor.y, waypoints: null })
        }
      } else if (endpoint === 'start') {
        const extra: Partial<BoardObject> = commitAnchor ? { connect_start_anchor: best.anchorId } : {}
        updateFn(connectorId, { x: best.x, y: best.y, waypoints: null, ...extra })
      } else {
        const extra: Partial<BoardObject> = commitAnchor ? { connect_end_anchor: best.anchorId } : {}
        updateFn(connectorId, { x2: best.x, y2: best.y, waypoints: null, ...extra })
      }
    }
  }, [objects, connectionIndex])

  const computeAllAnchors = useCallback((excludeId: string): { anchors: AnchorPoint[]; shapeMap: Map<string, { anchors: AnchorPoint[]; obj: BoardObject }> } => {
    const allAnchors: AnchorPoint[] = []
    const shapeMap = new Map<string, { anchors: AnchorPoint[]; obj: BoardObject }>()
    for (const [objId, obj] of objects) {
      if (objId === excludeId) continue
      if (isVectorType(obj.type) || obj.type === 'group') continue
      if (obj.deleted_at) continue
      const anchors = getShapeAnchors(obj)
      if (anchors.length > 0) {
        allAnchors.push(...anchors)
        shapeMap.set(objId, { anchors, obj })
      }
    }
    return { anchors: allAnchors, shapeMap }
  }, [objects])

  const resolveSnap = useCallback((
    anchors: AnchorPoint[],
    shapeMap: Map<string, { anchors: AnchorPoint[]; obj: BoardObject }>,
    px: number, py: number
  ): { snap: AnchorPoint | null; shapeId: string | null } => {
    const snap = findNearestAnchor(anchors, px, py, SNAP_DISTANCE)
    if (!snap) return { snap: null, shapeId: null }
    for (const [shapeId, entry] of shapeMap) {
      if (entry.anchors.some(a => a.id === snap.id && a.x === snap.x && a.y === snap.y)) {
        return { snap, shapeId }
      }
    }
    return { snap, shapeId: null }
  }, [])

  const handleEndpointDragMove = useCallback((id: string, updates: Partial<BoardObject>) => {
    if (!canEdit) return
    markActivity()
    const { anchors } = computeAllAnchors(id)
    const hasStart = updates.x !== undefined && updates.y !== undefined
    const hasEnd = updates.x2 != null && updates.y2 != null
    const isWholeDrag = hasStart && hasEnd
    let snap: AnchorPoint | null = null

    if (hasStart && !isWholeDrag) {
      snap = findNearestAnchor(anchors, updates.x!, updates.y!, SNAP_DISTANCE)
      if (snap) {
        updates = { ...updates, x: snap.x, y: snap.y }
      }
    } else if (hasEnd && !isWholeDrag) {
      snap = findNearestAnchor(anchors, updates.x2!, updates.y2!, SNAP_DISTANCE)
      if (snap) {
        updates = { ...updates, x2: snap.x, y2: snap.y }
      }
    }

    setSnapIndicator(snap ? { x: snap.x, y: snap.y } : null)

    if (isWholeDrag) {
      // Whole-line drag: Konva natively moves the Line node within its Group,
      // so all children (markers, anchors) travel with it visually.  Only
      // broadcast + write to dragPositionsRef (no React state) to avoid a
      // double-offset loop (Konva offset + Group state shift).
      updateObjectDrag(id, updates)
    } else {
      // Endpoint drag: trigger a React re-render so the Line redraws to the
      // new endpoint and markers follow.  Konva and React-Konva agree on the
      // Circle position so there's no double-offset.
      updateConnectorDrag(id, updates)
    }
  }, [canEdit, updateObjectDrag, updateConnectorDrag, computeAllAnchors, markActivity, setSnapIndicator])

  const handleEndpointDragEnd = useCallback((id: string, updates: Partial<BoardObject>, preDragRef: MutableRefObject<Map<string, { x: number; y: number; x2?: number | null; y2?: number | null; parent_id: string | null; waypoints?: string | null; connect_start_id?: string | null; connect_end_id?: string | null; connect_start_anchor?: string | null; connect_end_anchor?: string | null }>>) => {
    if (!canEdit) return
    markActivity()

    if (preDragRef.current.size === 0) {
      const obj = objects.get(id)
      if (obj) {
        preDragRef.current.set(id, { x: obj.x, y: obj.y, x2: obj.x2, y2: obj.y2, parent_id: obj.parent_id, waypoints: obj.waypoints, connect_start_id: obj.connect_start_id, connect_end_id: obj.connect_end_id, connect_start_anchor: obj.connect_start_anchor, connect_end_anchor: obj.connect_end_anchor })
      }
    }

    const { anchors, shapeMap } = computeAllAnchors(id)
    const hasStart = updates.x !== undefined && updates.y !== undefined
    const hasEnd = updates.x2 != null && updates.y2 != null
    const isWholeDrag = hasStart && hasEnd
    const connUpdates: Partial<BoardObject> = {}

    if (isWholeDrag) {
      connUpdates.connect_start_id = null
      connUpdates.connect_start_anchor = null
      connUpdates.connect_end_id = null
      connUpdates.connect_end_anchor = null
    } else if (hasStart) {
      const { snap, shapeId } = resolveSnap(anchors, shapeMap, updates.x!, updates.y!)
      if (snap) {
        updates = { ...updates, x: snap.x, y: snap.y }
        connUpdates.connect_start_id = shapeId
        connUpdates.connect_start_anchor = snap.id
      } else {
        connUpdates.connect_start_id = null
        connUpdates.connect_start_anchor = null
      }
    } else if (hasEnd) {
      const { snap, shapeId } = resolveSnap(anchors, shapeMap, updates.x2!, updates.y2!)
      if (snap) {
        updates = { ...updates, x2: snap.x, y2: snap.y }
        connUpdates.connect_end_id = shapeId
        connUpdates.connect_end_anchor = snap.id
      } else {
        connUpdates.connect_end_id = null
        connUpdates.connect_end_anchor = null
      }
    }

    setSnapIndicator(null)
    updateObjectDragEnd(id, { ...updates, ...connUpdates })

    if (preDragRef.current.size > 0) {
      const patches = Array.from(preDragRef.current.entries()).map(([pid, before]) => ({ id: pid, before }))
      undoStack.push({ type: 'move' as const, patches })
      preDragRef.current.clear()
    }

    setTimeout(() => checkFrameContainment(id), 0)
  }, [canEdit, objects, updateObjectDragEnd, undoStack, checkFrameContainment, computeAllAnchors, resolveSnap, markActivity, setSnapIndicator])

  const handleDrawLineFromAnchor = useCallback((type: BoardObjectType, startShapeId: string, startAnchor: string, startX: number, startY: number, endX: number, endY: number, screenEndX?: number, screenEndY?: number) => {
    if (!canEdit) return
    markActivity()

    const overrides: Partial<BoardObject> = {
      x2: endX,
      y2: endY,
      connect_start_id: startShapeId,
      connect_start_anchor: startAnchor,
    }

    const { anchors: allAnchors, shapeMap } = computeAllAnchors('__new__')
    const endSnap = findNearestAnchor(allAnchors, endX, endY, SNAP_DISTANCE)
    if (endSnap) {
      overrides.x2 = endSnap.x
      overrides.y2 = endSnap.y
      for (const [shapeId, entry] of shapeMap) {
        if (entry.anchors.some(a => a.id === endSnap.id && a.x === endSnap.x && a.y === endSnap.y)) {
          overrides.connect_end_id = shapeId
          overrides.connect_end_anchor = endSnap.id
          break
        }
      }
    }

    if (type === 'arrow') {
      overrides.marker_end = 'arrow'
    }

    const obj = addObject(type, startX, startY, overrides)
    if (obj) {
      undoStack.push({ type: 'add', ids: [obj.id] })
      if (!overrides.connect_end_id) {
        setShapePalette({
          lineId: obj.id,
          canvasX: overrides.x2 as number,
          canvasY: overrides.y2 as number,
          screenX: screenEndX,
          screenY: screenEndY,
        })
      }
    }
  }, [canEdit, addObject, undoStack, computeAllAnchors, markActivity, setShapePalette])

  const handlePaletteShapeSelect = useCallback(async (type: BoardObjectType) => {
    if (!shapePalette || !canEdit) return
    markActivity()
    const { lineId, canvasX, canvasY } = shapePalette
    const defaultW = type === 'sticky_note' ? 200 : 120
    const defaultH = type === 'sticky_note' ? 200 : 120
    const shapeX = canvasX - defaultW / 2
    const shapeY = canvasY - defaultH / 2
    const shapeObj = addObject(type, shapeX, shapeY, { width: defaultW, height: defaultH })
    if (shapeObj) {
      const anchors = getShapeAnchors(shapeObj)
      const nearest = findNearestAnchor(anchors, canvasX, canvasY, Infinity)
      if (nearest) {
        // Await shape persistence before setting connect_end_id FK reference
        await waitForPersist(shapeObj.id)
        const lineObj = objects.get(lineId)
        if (lineObj) {
          undoStack.push({ type: 'update', patches: [{ id: lineId, before: { x2: lineObj.x2, y2: lineObj.y2, connect_end_id: lineObj.connect_end_id, connect_end_anchor: lineObj.connect_end_anchor } }] })
        }
        updateObject(lineId, {
          x2: nearest.x,
          y2: nearest.y,
          connect_end_id: shapeObj.id,
          connect_end_anchor: nearest.id,
        })
      }
      undoStack.push({ type: 'add', ids: [shapeObj.id] })
    }
    setShapePalette(null)
  }, [shapePalette, canEdit, addObject, updateObject, undoStack, markActivity, objects, setShapePalette, waitForPersist])

  const handleWaypointDragEnd = useCallback((id: string, waypointIndex: number, x: number, y: number) => {
    if (!canEdit) return
    markActivity()
    const obj = objects.get(id)
    if (!obj) return
    const waypoints = parseWaypoints(obj.waypoints)
    if (waypointIndex * 2 + 1 >= waypoints.length) return
    const before: Partial<BoardObject> = { waypoints: obj.waypoints }
    const newWaypoints = [...waypoints]
    newWaypoints[waypointIndex * 2] = x
    newWaypoints[waypointIndex * 2 + 1] = y
    undoStack.push({ type: 'update', patches: [{ id, before }] })
    updateObject(id, { waypoints: JSON.stringify(newWaypoints) })
  }, [canEdit, objects, updateObject, undoStack, markActivity])

  const handleWaypointInsert = useCallback((id: string, afterSegmentIndex: number) => {
    if (!canEdit) return
    markActivity()
    const obj = objects.get(id)
    if (!obj) return
    const waypoints = parseWaypoints(obj.waypoints)
    const before: Partial<BoardObject> = { waypoints: obj.waypoints }
    const x2 = obj.x2 ?? obj.x + obj.width
    const y2 = obj.y2 ?? obj.y + obj.height
    const intermediate = waypoints.length > 0 ? waypoints : (autoRoutePointsRef.current.get(id) ?? computeAutoRoute(obj, objects) ?? [])
    const allPts: number[] = [obj.x, obj.y, ...intermediate, x2, y2]
    const i = afterSegmentIndex * 2
    if (i + 3 >= allPts.length) return
    const midX = (allPts[i] + allPts[i + 2]) / 2
    const midY = (allPts[i + 1] + allPts[i + 3]) / 2
    const baseWaypoints = waypoints.length > 0 ? [...waypoints] : [...intermediate]
    baseWaypoints.splice(afterSegmentIndex * 2, 0, midX, midY)
    undoStack.push({ type: 'update', patches: [{ id, before }] })
    updateObject(id, { waypoints: JSON.stringify(baseWaypoints) })
  }, [canEdit, objects, updateObject, undoStack, markActivity, autoRoutePointsRef])

  const handleWaypointDelete = useCallback((id: string, waypointIndex: number) => {
    if (!canEdit) return
    markActivity()
    const obj = objects.get(id)
    if (!obj) return
    const waypoints = parseWaypoints(obj.waypoints)
    if (waypointIndex * 2 + 1 >= waypoints.length) return
    const before: Partial<BoardObject> = { waypoints: obj.waypoints }
    const newWaypoints = [...waypoints]
    newWaypoints.splice(waypointIndex * 2, 2)
    undoStack.push({ type: 'update', patches: [{ id, before }] })
    updateObject(id, { waypoints: newWaypoints.length > 0 ? JSON.stringify(newWaypoints) : null })
  }, [canEdit, objects, updateObject, undoStack, markActivity])

  return {
    connectionIndex,
    followConnectors,
    handleEndpointDragMove,
    handleEndpointDragEnd,
    handleDrawLineFromAnchor,
    handlePaletteShapeSelect,
    handleWaypointDragEnd,
    handleWaypointInsert,
    handleWaypointDelete,
  }
}
