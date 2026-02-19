import React, { memo } from 'react'
import { Rect as KonvaRect, Line as KonvaLine, Group as KonvaGroup } from 'react-konva'
import { BoardObject } from '@/types/board'
import { isVectorType } from './shapeUtils'

export const LockIconOverlay = memo(function LockIconOverlay({
  visibleObjects,
  isObjectLocked,
}: {
  visibleObjects: BoardObject[]
  isObjectLocked: (id: string) => boolean
}) {
  return (
    <>
      {visibleObjects.map(obj => {
        if (obj.type === 'group') return null
        if (!isObjectLocked(obj.id)) return null
        let iconX: number, iconY: number
        if (isVectorType(obj.type)) {
          const ex2 = obj.x2 ?? obj.x + obj.width
          const ey2 = obj.y2 ?? obj.y + obj.height
          iconX = (obj.x + ex2) / 2 + 8
          iconY = (obj.y + ey2) / 2 - 20
        } else {
          iconX = obj.x + obj.width - 6
          iconY = obj.y - 6
        }
        return (
          <KonvaGroup key={`lock-${obj.id}`} x={iconX} y={iconY} listening={false}>
            {/* Lock body */}
            <KonvaRect
              x={-6} y={-3}
              width={12} height={9}
              fill="#9CA3AF"
              cornerRadius={2}
            />
            {/* Lock shackle (arc drawn as line) */}
            <KonvaLine
              points={[-3, -3, -3, -6, 0, -9, 3, -6, 3, -3]}
              stroke="#9CA3AF"
              strokeWidth={2.5}
              lineCap="round"
              lineJoin="round"
              tension={0.4}
            />
            {/* Keyhole */}
            <KonvaRect
              x={-1.5} y={0}
              width={3} height={3}
              fill="#F3F4F6"
              cornerRadius={1}
            />
          </KonvaGroup>
        )
      })}
    </>
  )
})
