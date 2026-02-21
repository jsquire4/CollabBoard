import React, { memo } from 'react'
import { Group as KonvaGroup, Rect as KonvaRect, Text as KonvaText, Line as KonvaLine } from 'react-konva'
import type { BoardObject } from '@/types/board'
import { commentBadgePosition } from '@/lib/board/overlayPositions'

// ─── Constants ────────────────────────────────────────────────────────────────

const BADGE_WIDTH = 28
const BADGE_HEIGHT = 18
const BADGE_CORNER_RADIUS = 9
const BADGE_FILL = '#1B3A6B'
const BADGE_TEXT_COLOR = '#FAF8F4'
const BADGE_FONT_SIZE = 11

// The triangle pointer sits below-left of the bubble.
// Points are relative to the KonvaGroup origin (top-left of badge rect).
const POINTER_POINTS = [
  4, BADGE_HEIGHT,      // left base of triangle (below the pill)
  10, BADGE_HEIGHT,     // right base of triangle
  2, BADGE_HEIGHT + 6,  // tip — points down-left
]

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ObjectIndicatorsProps {
  visibleObjects: BoardObject[]
  commentCounts: Map<string, number>
  /**
   * Provided for symmetry with LockIconOverlay — not used here because lock
   * icons are rendered by LockIconOverlay.tsx. Keeping it in the interface
   * makes it easy for callers to pass both props to both components without
   * spreading different prop shapes.
   */
  isObjectLocked: (id: string) => boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Renders per-object Konva overlays that live inside the main Konva Layer.
 *
 * Currently handles:
 *   - Comment count badges (navy pill with count + triangle pointer)
 *
 * Does NOT render lock icons — those are handled by LockIconOverlay.tsx.
 * All groups are `listening={false}` so they never intercept pointer events.
 */
export const ObjectIndicators = memo(function ObjectIndicators({
  visibleObjects,
  commentCounts,
}: ObjectIndicatorsProps) {
  return (
    <>
      {visibleObjects.map(obj => {
        if (obj.type === 'group') return null

        const count = commentCounts.get(obj.id) ?? 0
        if (count <= 0) return null

        const { x, y } = commentBadgePosition(obj)
        const label = count > 99 ? '99+' : String(count)

        return (
          <KonvaGroup
            key={`comment-badge-${obj.id}`}
            x={x}
            y={y}
            listening={false}
          >
            {/* Triangle pointer — rendered behind the pill so the pill overlaps its base */}
            <KonvaLine
              points={POINTER_POINTS}
              fill={BADGE_FILL}
              stroke={BADGE_FILL}
              strokeWidth={0}
              closed
              listening={false}
            />
            {/* Pill background */}
            <KonvaRect
              x={0}
              y={0}
              width={BADGE_WIDTH}
              height={BADGE_HEIGHT}
              fill={BADGE_FILL}
              cornerRadius={BADGE_CORNER_RADIUS}
              listening={false}
            />
            {/* Count label */}
            <KonvaText
              x={0}
              y={0}
              width={BADGE_WIDTH}
              height={BADGE_HEIGHT}
              text={label}
              fontSize={BADGE_FONT_SIZE}
              fontFamily="sans-serif"
              fill={BADGE_TEXT_COLOR}
              align="center"
              verticalAlign="middle"
              listening={false}
            />
          </KonvaGroup>
        )
      })}
    </>
  )
})
