/**
 * Tool executor for arranging objects in grid/horizontal/vertical layouts.
 */

import { loadBoardState, broadcastChanges } from '@/lib/agent/boardState'
import { makeToolDef, advanceClock, updateFields } from './helpers'
import { stampFields } from '@/lib/crdt/merge'
import { layoutObjectsSchema, computePlacementSchema } from './schemas'
import type { BoardObject } from '@/types/board'
import type { ToolContext, ToolDef } from './types'

/** Object types that can be repositioned by layoutObjects */
const MOVEABLE_TYPES = new Set([
  'sticky_note', 'rectangle', 'circle', 'triangle', 'chevron',
  'parallelogram', 'ngon', 'frame', 'image', 'file', 'table',
])

// ── Open area finder ──────────────────────────────────────────────────────────

const OPEN_AREA_MARGIN = 40

function findOpenArea(
  objects: Map<string, BoardObject>,
  width: number,
  height: number,
): { x: number; y: number } {
  let maxRight = -Infinity
  for (const obj of objects.values()) {
    if (obj.deleted_at) continue
    const right = (obj.x ?? 0) + (obj.width ?? 0)
    if (right > maxRight) maxRight = right
  }
  if (maxRight === -Infinity) return { x: 100, y: 100 }
  return { x: maxRight + OPEN_AREA_MARGIN, y: 100 }
}

// ── Grid cell computation ─────────────────────────────────────────────────────

function computeGridCells(
  originX: number,
  originY: number,
  totalW: number,
  totalH: number,
  rows: number,
  cols: number,
  padding: number,
): Array<{ x: number; y: number; width: number; height: number; centerX: number; centerY: number }> {
  const cellW = (totalW - padding * (cols + 1)) / cols
  const cellH = (totalH - padding * (rows + 1)) / rows
  const cells: Array<{ x: number; y: number; width: number; height: number; centerX: number; centerY: number }> = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = originX + padding + col * (cellW + padding)
      const y = originY + padding + row * (cellH + padding)
      cells.push({
        x,
        y,
        width: cellW,
        height: cellH,
        centerX: x + cellW / 2,
        centerY: y + cellH / 2,
      })
    }
  }
  return cells
}

// ── Tool definitions ──────────────────────────────────────────────────────────

export const layoutObjectTools: ToolDef[] = [

  makeToolDef(
    'computePlacement',
    'Compute an open area on the board and subdivide it into a grid of cells. Returns absolute coordinates for placing objects. Pure computation — no objects are created or moved.',
    computePlacementSchema,
    async (ctx, args) => {
      // Refresh state to get latest object positions
      const freshState = await loadBoardState(ctx.boardId)
      ctx.state = freshState

      const origin = findOpenArea(freshState.objects, args.width, args.height)
      const cells = computeGridCells(
        origin.x,
        origin.y,
        args.width,
        args.height,
        args.gridRows,
        args.gridCols,
        args.padding,
      )

      return { origin, cells }
    },
  ),

  makeToolDef(
    'layoutObjects',
    'Arrange objects on the board in a grid, horizontal row, or vertical column. If objectIds is omitted, arranges all moveable objects (sticky notes, shapes, frames, etc.).',
    layoutObjectsSchema,
    async (ctx, args) => {
      // Refresh state
      const freshState = await loadBoardState(ctx.boardId)
      ctx.state = freshState

      // Resolve target objects
      let targets = args.objectIds
        ? args.objectIds
            .map(id => freshState.objects.get(id))
            .filter(obj => obj && !obj.deleted_at)
        : Array.from(freshState.objects.values())
            .filter(obj => !obj.deleted_at && MOVEABLE_TYPES.has(obj.type))

      // Remove undefined entries (TypeScript narrowing)
      targets = targets.filter(Boolean)

      if (targets.length === 0) {
        return { error: 'No objects found to arrange' }
      }

      const layout = args.layout
      const startX = args.startX ?? 100
      const startY = args.startY ?? 100
      const padding = args.padding ?? 20

      // Compute positions based on layout strategy
      const positions: Array<{ id: string; x: number; y: number }> = []

      if (layout === 'grid') {
        const cols = args.columns ?? Math.max(1, Math.ceil(Math.sqrt(targets.length)))
        let col = 0
        let row = 0
        // Track max height per row for variable-sized objects
        let rowMaxHeight = 0
        let currentY = startY

        for (const obj of targets) {
          const w = obj!.width || 200
          const h = obj!.height || 200

          positions.push({
            id: obj!.id,
            x: startX + col * (w + padding),
            y: currentY,
          })

          if (h > rowMaxHeight) rowMaxHeight = h
          col++
          if (col >= cols) {
            col = 0
            row++
            currentY += rowMaxHeight + padding
            rowMaxHeight = 0
          }
        }
      } else if (layout === 'horizontal') {
        let currentX = startX
        for (const obj of targets) {
          const w = obj!.width || 200
          positions.push({ id: obj!.id, x: currentX, y: startY })
          currentX += w + padding
        }
      } else {
        // vertical
        let currentY = startY
        for (const obj of targets) {
          const h = obj!.height || 200
          positions.push({ id: obj!.id, x: startX, y: currentY })
          currentY += h + padding
        }
      }

      // Apply positions sequentially (avoids HLC contention)
      const moved: string[] = []
      for (const pos of positions) {
        const clock = advanceClock(ctx)
        const clocks = stampFields(['x', 'y'], clock)
        const result = await updateFields(
          pos.id, ctx.boardId,
          { x: pos.x, y: pos.y },
          clocks, ctx,
        )
        if (result.success) moved.push(pos.id)
      }

      // Single broadcast for all changes
      broadcastChanges(
        ctx.boardId,
        moved.map(id => ({
          action: 'update' as const,
          object: {
            id,
            x: positions.find(p => p.id === id)!.x,
            y: positions.find(p => p.id === id)!.y,
          },
        })),
      )

      return {
        success: true,
        layout,
        movedCount: moved.length,
        movedIds: moved,
      }
    },
  ),
]
