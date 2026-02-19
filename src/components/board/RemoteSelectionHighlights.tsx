import React, { memo } from 'react'
import { Rect as KonvaRect, Text as KonvaText, Group as KonvaGroup } from 'react-konva'
import { BoardObject } from '@/types/board'
import { isVectorType } from './shapeUtils'
import { OnlineUser, getColorForUser } from '@/hooks/usePresence'

// Compute the axis-aligned bounding box of a rect after rotation around its top-left corner.
// Returns { minX, minY } of the rotated AABB — used to position the name label at the visual top.
function getRotatedAABB(
  ox: number, oy: number, w: number, h: number, rotDeg: number
): { minX: number; minY: number; maxX: number; maxY: number } {
  const rad = (rotDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  // Four corners of the highlight rect relative to the rotation origin (ox, oy)
  const corners = [
    { x: -4, y: -4 },
    { x: w + 4, y: -4 },
    { x: -4, y: h + 4 },
    { x: w + 4, y: h + 4 },
  ]
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const c of corners) {
    const rx = ox + c.x * cos - c.y * sin
    const ry = oy + c.x * sin + c.y * cos
    if (rx < minX) minX = rx
    if (ry < minY) minY = ry
    if (rx > maxX) maxX = rx
    if (ry > maxY) maxY = ry
  }
  return { minX, minY, maxX, maxY }
}

// Memoized remote selection highlights — only re-renders when selections/objects change,
// not when the parent Canvas re-renders from drags, transforms, etc.
export const RemoteSelectionHighlights = memo(function RemoteSelectionHighlights({
  remoteSelections,
  onlineUsers,
  objects,
  getDescendants,
}: {
  remoteSelections: Map<string, Set<string>>
  onlineUsers?: OnlineUser[]
  objects: Map<string, BoardObject>
  getDescendants: (parentId: string) => BoardObject[]
}) {
  return (
    <>
      {Array.from(remoteSelections.entries()).map(([uid, objIds]) => {
        const user = onlineUsers?.find(u => u.user_id === uid)
        const color = user?.color ?? getColorForUser(uid)
        const name = user?.display_name ?? 'User'
        return Array.from(objIds).map(objId => {
          const obj = objects.get(objId)
          if (!obj) return null

          // For groups, compute bounding box from descendants
          if (obj.type === 'group') {
            const children = getDescendants(objId).filter(c => c.type !== 'group')
            if (children.length === 0) return null
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
            for (const c of children) {
              if (isVectorType(c.type)) {
                const cx2 = c.x2 ?? c.x + c.width
                const cy2 = c.y2 ?? c.y + c.height
                minX = Math.min(minX, c.x, cx2)
                minY = Math.min(minY, c.y, cy2)
                maxX = Math.max(maxX, c.x, cx2)
                maxY = Math.max(maxY, c.y, cy2)
              } else {
                minX = Math.min(minX, c.x)
                minY = Math.min(minY, c.y)
                maxX = Math.max(maxX, c.x + c.width)
                maxY = Math.max(maxY, c.y + c.height)
              }
            }
            const gx = minX - 8
            const gy = minY - 8
            const gw = maxX - minX + 16
            const gh = maxY - minY + 16
            const labelWidth = Math.min(name.length * 7 + 12, 120)
            return (
              <KonvaGroup key={`remote-sel-${uid}-${objId}`} listening={false}>
                <KonvaRect
                  x={gx} y={gy} width={gw} height={gh}
                  fill="transparent" stroke={color} strokeWidth={2}
                  cornerRadius={6} dash={[8, 4]}
                  shadowColor={`${color}4D`} shadowBlur={12}
                />
                <KonvaRect
                  x={gx} y={gy - 20}
                  width={labelWidth} height={16}
                  fill={color} cornerRadius={3}
                />
                <KonvaText
                  x={gx + 6} y={gy - 20 + 2}
                  text={name} fontSize={10} fill="white"
                  width={labelWidth - 12} ellipsis={true} wrap="none"
                />
              </KonvaGroup>
            )
          }

          const labelWidth = Math.min(name.length * 7 + 12, 120)

          // For vector types, use AABB from endpoints (no rotation)
          if (isVectorType(obj.type)) {
            const ex2 = obj.x2 ?? obj.x + obj.width
            const ey2 = obj.y2 ?? obj.y + obj.height
            const bx = Math.min(obj.x, ex2)
            const by = Math.min(obj.y, ey2)
            const bw = Math.abs(ex2 - obj.x)
            const bh = Math.abs(ey2 - obj.y)
            return (
              <KonvaGroup key={`remote-sel-${uid}-${objId}`} listening={false}>
                <KonvaRect
                  x={bx - 4} y={by - 4}
                  width={bw + 8} height={bh + 8}
                  fill="transparent" stroke={color} strokeWidth={2}
                  cornerRadius={4} dash={[6, 3]}
                />
                <KonvaRect
                  x={bx - 4} y={by - 20}
                  width={labelWidth} height={16}
                  fill={color} cornerRadius={3}
                />
                <KonvaText
                  x={bx - 4 + 6} y={by - 20 + 2}
                  text={name} fontSize={10} fill="white"
                  width={labelWidth - 12} ellipsis={true} wrap="none"
                />
              </KonvaGroup>
            )
          }

          // For non-vector shapes: rotate the highlight with the shape
          const rotation = (obj.type === 'circle') ? 0 : (obj.rotation || 0)
          const bw = obj.width
          const bh = obj.height

          // Compute where the visual top of the rotated box is for the name label
          let labelX: number, labelY: number
          if (rotation !== 0) {
            const aabb = getRotatedAABB(obj.x, obj.y, bw, bh, rotation)
            labelX = aabb.minX
            labelY = aabb.minY - 16
          } else {
            labelX = obj.x - 4
            labelY = obj.y - 20
          }

          return (
            <KonvaGroup key={`remote-sel-${uid}-${objId}`} listening={false}>
              {/* Dashed highlight rect — rotated with the shape */}
              <KonvaGroup x={obj.x} y={obj.y} rotation={rotation}>
                <KonvaRect
                  x={-4} y={-4}
                  width={bw + 8} height={bh + 8}
                  fill="transparent" stroke={color} strokeWidth={2}
                  cornerRadius={4} dash={[6, 3]}
                />
              </KonvaGroup>
              {/* Name label — always horizontal, at visual top */}
              <KonvaRect
                x={labelX} y={labelY}
                width={labelWidth} height={16}
                fill={color} cornerRadius={3}
              />
              <KonvaText
                x={labelX + 6} y={labelY + 2}
                text={name} fontSize={10} fill="white"
                width={labelWidth - 12} ellipsis={true} wrap="none"
              />
            </KonvaGroup>
          )
        })
      })}
    </>
  )
})
