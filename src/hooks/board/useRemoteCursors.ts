'use client'

import { useEffect, useRef } from 'react'
import Konva from 'konva'
import { RemoteCursorData } from '@/hooks/useCursors'
import { OnlineUser, getColorForUser } from '@/hooks/usePresence'

// ── Hook interface ──────────────────────────────────────────────────

export interface UseRemoteCursorsDeps {
  onCursorUpdate?: (fn: (cursors: Map<string, RemoteCursorData>) => void) => void
  onlineUsers?: OnlineUser[]
}

// ── Hook ────────────────────────────────────────────────────────────

export function useRemoteCursors({
  onCursorUpdate,
  onlineUsers,
}: UseRemoteCursorsDeps) {
  const cursorLayerRef = useRef<Konva.Layer>(null)
  const cursorNodesRef = useRef<Map<string, Konva.Group>>(new Map())
  const onlineUsersRef = useRef(onlineUsers)
  onlineUsersRef.current = onlineUsers

  // Imperatively update Konva cursor nodes — no React re-renders.
  // Positions are snapped directly (same as remote shape updates) to avoid
  // lag. The cursor broadcast is already throttled at 50ms intervals, which
  // provides enough temporal density for smooth visual movement.
  useEffect(() => {
    if (!onCursorUpdate) return

    onCursorUpdate((cursors: Map<string, RemoteCursorData>) => {
      const layer = cursorLayerRef.current
      if (!layer) return

      const activeIds = new Set<string>()

      for (const [uid, cursor] of cursors.entries()) {
        activeIds.add(uid)
        let group = cursorNodesRef.current.get(uid)

        if (!group) {
          // Create new cursor node imperatively
          const users = onlineUsersRef.current
          const user = users?.find(u => u.user_id === uid)
          const color = user?.color ?? getColorForUser(uid)
          const name = user?.display_name ?? 'User'

          group = new Konva.Group({ listening: false })
          // Traditional pointer cursor shape
          const arrow = new Konva.Line({
            points: [
              0, 0,       // tip
              0, 20,      // down left edge
              5.5, 15.5,  // notch inward
              10, 22,     // lower-right tail
              12.5, 20.5, // tail right edge
              8, 14,      // notch back
              14, 14,     // right wing
            ],
            fill: color,
            closed: true,
            stroke: '#FFFFFF',
            strokeWidth: 1.5,
            lineJoin: 'round',
          })
          // Name label with background pill
          const labelText = name
          const tempText = new Konva.Text({ text: labelText, fontSize: 11, fontStyle: 'bold' })
          const textW = tempText.width()
          tempText.destroy()
          const pillPadX = 6
          const pillPadY = 3
          const labelBg = new Konva.Rect({
            x: 12,
            y: 18,
            width: textW + pillPadX * 2,
            height: 11 + pillPadY * 2,
            fill: color,
            cornerRadius: 4,
          })
          const label = new Konva.Text({
            x: 12 + pillPadX,
            y: 18 + pillPadY,
            text: labelText,
            fontSize: 11,
            fill: '#FFFFFF',
            fontStyle: 'bold',
          })
          group.add(arrow, labelBg, label)
          layer.add(group)
          cursorNodesRef.current.set(uid, group)
        }

        group.position({ x: cursor.x, y: cursor.y })
      }

      // Remove stale cursor nodes
      for (const [uid, group] of cursorNodesRef.current.entries()) {
        if (!activeIds.has(uid)) {
          group.destroy()
          cursorNodesRef.current.delete(uid)
        }
      }

      layer.batchDraw()
    })
  }, [onCursorUpdate])

  return { cursorLayerRef }
}
