import type { BoardObject } from '@/types/board'

/**
 * Returns the canvas-space position for a comment count badge.
 * Placed at the top-right corner of the object's bounding box,
 * offset slightly outward so it doesn't overlap the shape border.
 *
 * For vector types (line / arrow / data_connector) that use x2/y2
 * endpoints instead of width/height, the midpoint of the segment
 * is used as the anchor instead.
 */
export function commentBadgePosition(obj: BoardObject): { x: number; y: number } {
  const hasEndpoints = obj.x2 != null && obj.y2 != null
  if (hasEndpoints) {
    const ex2 = obj.x2 as number
    const ey2 = obj.y2 as number
    return {
      x: (obj.x + ex2) / 2 + 8,
      y: (obj.y + ey2) / 2 - 24,
    }
  }
  return {
    x: obj.x + obj.width - 2,
    y: obj.y - 10,
  }
}

/**
 * Returns the canvas-space position for a lock badge icon.
 * Mirrors the positioning logic used in LockIconOverlay.tsx:
 * – Vector types: midpoint of the segment, offset right/up
 * – Regular shapes: right edge minus 6, top minus 6
 *
 * The KonvaGroup in LockIconOverlay is positioned at (iconX, iconY)
 * and the inner lock shapes are drawn with small relative offsets
 * from that group origin, so this function returns the same group
 * anchor coordinates.
 */
export function lockBadgePosition(obj: BoardObject): { x: number; y: number } {
  const hasEndpoints = obj.x2 != null && obj.y2 != null
  if (hasEndpoints) {
    const ex2 = obj.x2 as number
    const ey2 = obj.y2 as number
    return {
      x: (obj.x + ex2) / 2 + 8,
      y: (obj.y + ey2) / 2 - 20,
    }
  }
  return {
    x: obj.x + obj.width - 6,
    y: obj.y - 6,
  }
}
