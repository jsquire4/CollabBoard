'use client'

import { useState, useRef, useEffect } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ConnectionStatus } from '@/components/ui/ConnectionBanner'

const LOG_PREFIX = '[Realtime]'

interface UseConnectionManagerParams {
  channel: RealtimeChannel | null
  trackPresence: () => void
  reconcileOnReconnect: () => void
  supabaseRef: React.MutableRefObject<SupabaseClient>
}

export function useConnectionManager({
  channel,
  trackPresence,
  reconcileOnReconnect,
  supabaseRef,
}: UseConnectionManagerParams): {
  connectionStatus: ConnectionStatus
} {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connected')
  const hasConnectedRef = useRef(false)
  const mountedRef = useRef(true)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptRef = useRef(0)
  const connectStartRef = useRef<number>(0)
  // Bug 5 fix: unsubscribe() fires a synchronous CLOSED callback that double-counts
  // reconnect attempts. This flag lets us ignore CLOSED events from our own unsubscribe.
  const isIntentionalUnsubRef = useRef(false)
  const MAX_RECONNECT_ATTEMPTS = 5

  // Subscribe LAST — after all hooks have registered their .on() listeners.
  useEffect(() => {
    if (!channel) return
    mountedRef.current = true
    connectStartRef.current = Date.now()
    const attemptReconnect = (triggerEvent: string) => {
      // Bug 3 fix: increment first, then guard — so all MAX_RECONNECT_ATTEMPTS fire
      reconnectAttemptRef.current += 1
      const attempt = reconnectAttemptRef.current
      if (attempt > MAX_RECONNECT_ATTEMPTS) {
        console.error(`${LOG_PREFIX} All ${MAX_RECONNECT_ATTEMPTS} reconnect attempts exhausted (last trigger: ${triggerEvent}). Giving up.`)
        setConnectionStatus('disconnected')
        return
      }
      // Clear any pending timer to avoid duplicate reconnects
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      setConnectionStatus('reconnecting')
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 16000)
      console.warn(`${LOG_PREFIX} Reconnect attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms (trigger: ${triggerEvent})`)
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null
        // Use disconnect() rather than unsubscribe() to force a clean WebSocket
        // teardown before re-subscribing. After a server-initiated CLOSED event,
        // channel.unsubscribe() + channel.subscribe() can silently no-op if the
        // channel's internal state machine isn't in exactly 'closed' — the
        // subscribe() call is swallowed and no further status callbacks fire,
        // leaving the UI stuck at 'reconnecting' indefinitely. disconnect() tears
        // down the transport cleanly without firing per-channel CLOSED callbacks
        // (so isIntentionalUnsubRef is not needed here), and the subsequent
        // subscribe() auto-connects a fresh WebSocket.
        supabaseRef.current.realtime.disconnect()
        connectStartRef.current = Date.now()
        channel.subscribe()
      }, delay)
    }

    channel.subscribe((status) => {
      if (!mountedRef.current) return
      if (isIntentionalUnsubRef.current) return // Bug 5: ignore CLOSED from our own unsubscribe
      const elapsed = Date.now() - connectStartRef.current
      if (status === 'SUBSCRIBED') {
        const wasReconnect = hasConnectedRef.current
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current)
          reconnectTimerRef.current = null
        }
        reconnectAttemptRef.current = 0
        setConnectionStatus('connected')
        trackPresence()
        if (wasReconnect) {
          reconcileOnReconnect()
        } else {
          hasConnectedRef.current = true
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        console.warn(`${LOG_PREFIX} Channel event: ${status} (after ${elapsed}ms, channel.state=${(channel as unknown as { state: string }).state})`)
        // Bug 4 fix: go straight to reconnecting — skip the transient 'disconnected' state
        // 'disconnected' is only set inside attemptReconnect when all attempts are exhausted
        attemptReconnect(status)
      }
    })

    return () => {
      mountedRef.current = false
      // Bug 2 fix: unsubscribe the channel to prevent stacked callbacks on effect re-runs
      isIntentionalUnsubRef.current = true
      channel.unsubscribe()
      isIntentionalUnsubRef.current = false
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      reconnectAttemptRef.current = 0
    }
  }, [channel, trackPresence, reconcileOnReconnect])

  // Auth expiry detection
  useEffect(() => {
    const { data: { subscription } } = supabaseRef.current.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        console.warn(`${LOG_PREFIX} Auth expired — session signed out`)
        setConnectionStatus('auth_expired')
      }
    })
    return () => subscription.unsubscribe()
  }, [supabaseRef])

  return { connectionStatus }
}
