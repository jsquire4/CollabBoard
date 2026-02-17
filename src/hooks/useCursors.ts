'use client'

import { useEffect, useRef, useCallback } from 'react'
import { RealtimeChannel } from '@supabase/supabase-js'

export interface RemoteCursorData {
  x: number
  y: number
  user_id: string
}

const THROTTLE_MS = 50
const STALE_TIMEOUT_MS = 5000

type CursorListener = (cursors: Map<string, RemoteCursorData>) => void

export function useCursors(
  channel: RealtimeChannel | null,
  userId: string
) {
  const cursorsRef = useRef<Map<string, RemoteCursorData>>(new Map())
  const lastSendRef = useRef(0)
  const staleTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const rafId = useRef(0)
  const dirtyRef = useRef(false)
  const listenerRef = useRef<CursorListener | null>(null)

  // Allow external code to subscribe to cursor updates (called from rAF loop)
  const onCursorUpdate = useCallback((fn: CursorListener) => {
    listenerRef.current = fn
  }, [])

  // rAF flush loop — only notifies listener when data has changed
  useEffect(() => {
    const flush = () => {
      if (dirtyRef.current && listenerRef.current) {
        dirtyRef.current = false
        listenerRef.current(cursorsRef.current)
      }
      rafId.current = requestAnimationFrame(flush)
    }
    rafId.current = requestAnimationFrame(flush)
    return () => cancelAnimationFrame(rafId.current)
  }, [])

  // Listen for incoming cursor broadcasts — writes to ref, no React state
  useEffect(() => {
    if (!channel) return

    const handler = ({ payload }: { payload: RemoteCursorData }) => {
      if (payload.user_id === userId) return

      cursorsRef.current.set(payload.user_id, payload)
      dirtyRef.current = true

      // Reset stale timer
      const existing = staleTimers.current.get(payload.user_id)
      if (existing) clearTimeout(existing)
      staleTimers.current.set(
        payload.user_id,
        setTimeout(() => {
          cursorsRef.current.delete(payload.user_id)
          dirtyRef.current = true
          staleTimers.current.delete(payload.user_id)
        }, STALE_TIMEOUT_MS)
      )
    }

    channel.on('broadcast', { event: 'cursor' }, handler)

    return () => {
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

  return { cursorsRef, sendCursor, onCursorUpdate }
}
