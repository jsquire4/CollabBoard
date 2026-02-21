/**
 * Tool executor for arranging objects in grid/horizontal/vertical layouts.
 */

import { loadBoardState, broadcastChanges } from '@/lib/agent/boardState'
import { makeToolDef, advanceClock, updateFields } from './helpers'
import { stampFields } from '@/lib/crdt/merge'
import { layoutObjectsSchema } from './schemas'
import type { ToolDef } from './types'

/** Object types that can be repositioned by layoutObjects */
const MOVEABLE_TYPES = new Set([
  'sticky_note', 'rectangle', 'circle', 'triangle', 'chevron',
  'parallelogram', 'ngon', 'frame', 'image', 'file', 'table',
])

export const layoutObjectTools: ToolDef[] = [

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
