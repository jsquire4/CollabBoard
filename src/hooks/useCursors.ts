'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { RealtimeChannel } from '@supabase/supabase-js'

export interface RemoteCursorData {
  x: number
  y: number
  user_id: string
}

const THROTTLE_MS = 30
const STALE_TIMEOUT_MS = 5000

export function useCursors(
  channel: RealtimeChannel | null,
  userId: string
) {
  const [remoteCursors, setRemoteCursors] = useState<Map<string, RemoteCursorData>>(new Map())
  const lastSendRef = useRef(0)
  const staleTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Listen for incoming cursor broadcasts
  useEffect(() => {
    if (!channel) return

    const handler = ({ payload }: { payload: RemoteCursorData }) => {
      if (payload.user_id === userId) return

      setRemoteCursors(prev => {
        const next = new Map(prev)
        next.set(payload.user_id, payload)
        return next
      })

      // Reset stale timer for this user
      const existing = staleTimers.current.get(payload.user_id)
      if (existing) clearTimeout(existing)
      staleTimers.current.set(
        payload.user_id,
        setTimeout(() => {
          setRemoteCursors(prev => {
            const next = new Map(prev)
            next.delete(payload.user_id)
            return next
          })
          staleTimers.current.delete(payload.user_id)
        }, STALE_TIMEOUT_MS)
      )
    }

    channel.on('broadcast', { event: 'cursor' }, handler)

    return () => {
      // Clean up stale timers
      for (const timer of staleTimers.current.values()) {
        clearTimeout(timer)
      }
      staleTimers.current.clear()
    }
  }, [channel, userId])

  // Send cursor position (throttled)
  const sendCursor = useCallback((x: number, y: number) => {
    if (!channel) return

    const now = Date.now()
    if (now - lastSendRef.current < THROTTLE_MS) return
    lastSendRef.current = now

    channel.send({
      type: 'broadcast',
      event: 'cursor',
      payload: { x, y, user_id: userId },
    })
  }, [channel, userId])

  return { remoteCursors, sendCursor }
}
