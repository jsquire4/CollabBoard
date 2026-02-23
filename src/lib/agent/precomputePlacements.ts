/**
 * Pre-compute placements for quick actions to avoid computePlacement tool calls.
 * When the API knows the full request (e.g. SWOT ×2), it computes all placements
 * upfront and injects them into the prompt — saving tool calls and round-trips.
 */

import { findOpenArea } from './tools/placement'
import type { BoardObject } from '@/types/board'

/** Placement requirements for quick actions that create templates. */
const PLACEMENT_SPECS: Record<string, { width: number; height: number; gridRows: number; gridCols: number; padding?: number }> = {
  swot: { width: 820, height: 620, gridRows: 2, gridCols: 2, padding: 20 },
  journey: { width: 1200, height: 400, gridRows: 1, gridCols: 5, padding: 20 },
  retro: { width: 1090, height: 500, gridRows: 1, gridCols: 3, padding: 20 },
  'sticky-grid': { width: 500, height: 500, gridRows: 3, gridCols: 2, padding: 20 },
  sticky: { width: 200, height: 200, gridRows: 1, gridCols: 1, padding: 0 },
  rectangle: { width: 200, height: 200, gridRows: 1, gridCols: 1, padding: 0 },
  frame: { width: 400, height: 300, gridRows: 1, gridCols: 1, padding: 0 },
  table: { width: 400, height: 300, gridRows: 1, gridCols: 1, padding: 0 },
}

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

export interface PrecomputedPlacement {
  actionId: string
  index: number
  origin: { x: number; y: number }
  cells: Array<{ x: number; y: number; width: number; height: number; centerX: number; centerY: number }>
}

/**
 * Pre-compute placements for all quick actions in the request.
 * Simulates each placement as a blocking rect so subsequent placements don't overlap.
 */
export function precomputePlacements(
  objects: Map<string, BoardObject>,
  quickActionIds: string[],
  viewportCenter?: { x: number; y: number },
): PrecomputedPlacement[] {
  const results: PrecomputedPlacement[] = []
  const simulatedObjects = new Map(objects)

  for (let i = 0; i < quickActionIds.length; i++) {
    const actionId = quickActionIds[i]!
    const spec = PLACEMENT_SPECS[actionId]
    if (!spec) continue

    const padding = spec.padding ?? 20
    const origin = findOpenArea(simulatedObjects, spec.width, spec.height, viewportCenter)
    const cells = computeGridCells(
      origin.x,
      origin.y,
      spec.width,
      spec.height,
      spec.gridRows,
      spec.gridCols,
      padding,
    )

    results.push({ actionId, index: results.length, origin, cells })

    // Simulate this placement so the next findOpenArea won't overlap
    const syntheticId = `__placement_${i}__`
    simulatedObjects.set(syntheticId, {
      id: syntheticId,
      type: 'rectangle',
      x: origin.x,
      y: origin.y,
      width: spec.width,
      height: spec.height,
    } as BoardObject)
  }

  return results
}

/** Format precomputed placements for injection into the agent prompt. */
export function formatPrecomputedPlacements(placements: PrecomputedPlacement[]): string {
  if (placements.length === 0) return ''
  const lines = placements.map((p, i) => {
    const cellsJson = JSON.stringify(p.cells)
    return `Placement ${i + 1} (${p.actionId}): origin (${p.origin.x}, ${p.origin.y}), cells: ${cellsJson}`
  })
  return `<precomputed_placements>\nUse these coordinates directly. If the user clarifies the request (e.g. "just one SWOT"), call precomputePlacements with the updated quickActionIds to get fresh placements.\n\n${lines.join('\n\n')}\n</precomputed_placements>`
}
