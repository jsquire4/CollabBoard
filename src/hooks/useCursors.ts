'use client'

import { useEffect, useRef, useCallback, useMemo } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface RemoteCursorData {
  x: number
  y: number
  user_id: string
}

// --- Adaptive throttle constants ---
const RATE_LIMIT = 500        // Supabase Pro msg/s per connection
const SAFETY = 0.85           // target 85% utilization
const SHAPE_HZ = 20           // worst-case broadcast rate per active editor
const EDIT_RATIO = 0.3        // assume 30% of users are actively editing
const MIN_THROTTLE = 16       // cap at ~60Hz (one display frame)
const MAX_THROTTLE = 150      // floor at ~7Hz (32 users)

const STALE_TIMEOUT_MS = 5000
const MIN_DURATION = 16       // minimum interpolation duration (one frame)
const MAX_DURATION = 50        // cap so late-arriving messages don't cause slow-motion

// --- Interpolation state per remote cursor ---
interface CursorState {
  user_id: string
  // Where we started interpolating from (snapshot of rendered pos when target arrived)
  start: { x: number; y: number }
  // The latest received position we're moving toward
  target: { x: number; y: number }
  // When the current target was received (performance.now)
  targetTime: number
  // How long to take reaching the target (based on actual arrival interval)
  duration: number
  // Current rendered position (Infinity sentinel = never emitted yet)
  rendered: { x: number; y: number }
}

/** Compute the ideal cursor throttle interval based on current user count. */
export function computeThrottleMs(userCount: number): number {
  const editors = Math.max(1, Math.ceil(userCount * EDIT_RATIO))
  const shapeBudget = editors * SHAPE_HZ
  const cursorBudget = RATE_LIMIT * SAFETY - shapeBudget
  if (cursorBudget <= 0) return MAX_THROTTLE
  const peers = Math.max(1, userCount - 1)
  const hz = cursorBudget / peers
  return Math.min(MAX_THROTTLE, Math.max(MIN_THROTTLE, Math.ceil(1000 / hz)))
}

type CursorListener = (cursors: Map<string, RemoteCursorData>) => void

export function useCursors(
  channel: RealtimeChannel | null,
  userId: string,
  userCount: number = 1
) {
  const cursorStatesRef = useRef<Map<string, CursorState>>(new Map())
  const lastSendRef = useRef(0)
  const staleTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const rafId = useRef(0)
  const listenerRef = useRef<CursorListener | null>(null)
  const dirtyRef = useRef(false) // forces emission on add/remove even when positions unchanged

  // Adaptive throttle — recomputed when userCount changes
  const throttleMs = useMemo(() => computeThrottleMs(userCount), [userCount])
  const throttleMsRef = useRef(throttleMs)
  useEffect(() => { throttleMsRef.current = throttleMs }, [throttleMs])

  // Allow external code to subscribe to cursor updates (called from rAF loop)
  const onCursorUpdate = useCallback((fn: CursorListener) => {
    listenerRef.current = fn
  }, [])

  // rAF flush loop — linearly interpolates each cursor from start toward target
  useEffect(() => {
    const flush = () => {
      if (!listenerRef.current) {
        rafId.current = requestAnimationFrame(flush)
        return
      }

      const states = cursorStatesRef.current
      const now = performance.now()
      let changed = false

      for (const state of states.values()) {
        const { start, target, targetTime, duration, rendered } = state

        // Linear progress from 0 (at start) to 1 (reached target)
        const elapsed = now - targetTime
        const progress = Math.min(1.0, elapsed / duration)

        const x = start.x + (target.x - start.x) * progress
        const y = start.y + (target.y - start.y) * progress

        // Only flag as changed if the rendered position actually moved
        if (x !== rendered.x || y !== rendered.y) {
          state.rendered = { x, y }
          changed = true
        }
      }

      // Emit when positions changed OR when a cursor was added/removed (dirty).
      // Emitting an empty map lets Canvas clean up stale Konva nodes.
      if (changed || dirtyRef.current) {
        dirtyRef.current = false
        const interpolated = new Map<string, RemoteCursorData>()
        for (const [uid, state] of states.entries()) {
          interpolated.set(uid, {
            x: state.rendered.x,
            y: state.rendered.y,
            user_id: uid,
          })
        }
        listenerRef.current?.(interpolated)
      }

      rafId.current = requestAnimationFrame(flush)
    }

    rafId.current = requestAnimationFrame(flush)
    return () => cancelAnimationFrame(rafId.current)
  }, [])

  // Listen for incoming cursor broadcasts — updates chase target, no React state
  useEffect(() => {
    if (!channel) return

    const handler = ({ payload }: { payload: RemoteCursorData }) => {
      if (payload.user_id === userId) return

      const now = performance.now()
      const existing = cursorStatesRef.current.get(payload.user_id)

      if (existing) {
        // Start interpolating from current rendered position toward the new target.
        // Duration is capped so delayed messages don't cause slow-motion movement.
        // If a message arrives late, the cursor moves at normal speed and "catches up."
        const interval = now - existing.targetTime
        existing.start = { x: existing.rendered.x, y: existing.rendered.y }
        existing.target = { x: payload.x, y: payload.y }
        existing.duration = Math.min(MAX_DURATION, Math.max(MIN_DURATION, interval))
        existing.targetTime = now
      } else {
        // First sample — snap to position and mark dirty so rAF emits immediately
        cursorStatesRef.current.set(payload.user_id, {
          user_id: payload.user_id,
          start: { x: payload.x, y: payload.y },
          target: { x: payload.x, y: payload.y },
          targetTime: now,
          duration: MIN_DURATION,
          rendered: { x: payload.x, y: payload.y },
        })
        dirtyRef.current = true
      }

      // Reset stale timer
      const existingTimer = staleTimers.current.get(payload.user_id)
      if (existingTimer) clearTimeout(existingTimer)
      staleTimers.current.set(
        payload.user_id,
        setTimeout(() => {
          cursorStatesRef.current.delete(payload.user_id)
          staleTimers.current.delete(payload.user_id)
          dirtyRef.current = true // trigger emission so Canvas removes the node
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

  // Send cursor position (adaptive throttle).
  // Only send when the WebSocket channel is joined — otherwise channel.send()
  // falls back to REST API, flooding the server with HTTP requests.
  const sendCursor = useCallback((x: number, y: number) => {
    if (!channel) return
    if ((channel as unknown as { state: string }).state !== 'joined') return

    const now = Date.now()
    if (now - lastSendRef.current < throttleMsRef.current) return
    lastSendRef.current = now

    channel.send({
      type: 'broadcast',
      event: 'cursor',
      payload: { x, y, user_id: userId },
    })
  }, [channel, userId])

  return { sendCursor, onCursorUpdate }
}
