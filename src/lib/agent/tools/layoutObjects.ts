/**
 * Tool executor for arranging objects in grid/horizontal/vertical layouts.
 */

import { loadBoardState, broadcastChanges } from '@/lib/agent/boardState'
import { precomputePlacements as precomputePlacementsFn } from '@/lib/agent/precomputePlacements'
import { makeToolDef, advanceClock, updateFields } from './helpers'
import { stampFields } from '@/lib/crdt/merge'
import { findOpenArea } from './placement'
import { layoutObjectsSchema, computePlacementSchema, precomputePlacementsSchema } from './schemas'
import type { BoardObject } from '@/types/board'
import type { ToolContext, ToolDef } from './types'

/** Object types that can be repositioned by layoutObjects */
const MOVEABLE_TYPES = new Set([
  'sticky_note', 'rectangle', 'circle', 'triangle', 'chevron',
  'parallelogram', 'ngon', 'frame', 'image', 'file', 'table',
])

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
    'Compute grid cells for placement. Returns origin + cells with x,y,w,h,centerX,centerY. No objects created.',
    computePlacementSchema,
    async (ctx, args) => {
      // Refresh state to get latest object positions
      const freshState = await loadBoardState(ctx.boardId)
      ctx.state = freshState

      const origin = findOpenArea(freshState.objects, args.width, args.height, ctx.viewportCenter)
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
    'precomputePlacements',
    'Get placements for multiple quick actions at once. Call when the request was clarified (e.g. user said "just one SWOT") — returns fresh placements for the given quickActionIds. Uses current board state.',
    precomputePlacementsSchema,
    async (ctx, args) => {
      const freshState = await loadBoardState(ctx.boardId)
      ctx.state = freshState
      const placements = precomputePlacementsFn(
        freshState.objects,
        args.quickActionIds,
        ctx.viewportCenter,
      )
      return { placements }
    },
  ),

  makeToolDef(
    'layoutObjects',
    'Arrange objects in grid, horizontal, or vertical layout. Omit objectIds to arrange all moveable objects.',
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
      const radius = args.radius

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
      } else if (layout === 'circle') {
        const n = targets.length
        const r = radius ?? Math.max(150, (Math.max(...targets.map(o => (o!.width || 200) + (o!.height || 200))) * n) / (2 * Math.PI))
        const centerX = startX + r
        const centerY = startY + r
        for (let i = 0; i < n; i++) {
          const obj = targets[i]!
          const angle = (2 * Math.PI * i) / n - Math.PI / 2
          const x = centerX + r * Math.cos(angle) - (obj.width || 200) / 2
          const y = centerY + r * Math.sin(angle) - (obj.height || 200) / 2
          positions.push({ id: obj.id, x, y })
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
