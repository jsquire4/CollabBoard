'use client'

import { useState, useRef, useEffect } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ConnectionStatus } from '@/components/ui/ConnectionBanner'

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
  const MAX_RECONNECT_ATTEMPTS = 5

  // Subscribe LAST — after all hooks have registered their .on() listeners.
  useEffect(() => {
    if (!channel) return
    mountedRef.current = true

    const attemptReconnect = () => {
      // Bug 3 fix: increment first, then guard — so all MAX_RECONNECT_ATTEMPTS fire
      reconnectAttemptRef.current += 1
      if (reconnectAttemptRef.current > MAX_RECONNECT_ATTEMPTS) {
        setConnectionStatus('disconnected')
        return
      }
      // Clear any pending timer to avoid duplicate reconnects
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      setConnectionStatus('reconnecting')
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current - 1), 16000)
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null
        // Bug 1 fix: unsubscribe first to transition 'errored' → 'closed' before re-subscribing
        channel.unsubscribe()
        channel.subscribe()
      }, delay)
    }

    channel.subscribe((status) => {
      if (!mountedRef.current) return
      if (status === 'SUBSCRIBED') {
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current)
          reconnectTimerRef.current = null
        }
        reconnectAttemptRef.current = 0
        setConnectionStatus('connected')
        trackPresence()
        if (hasConnectedRef.current) {
          reconcileOnReconnect()
        } else {
          hasConnectedRef.current = true
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        // Bug 4 fix: go straight to reconnecting — skip the transient 'disconnected' state
        // 'disconnected' is only set inside attemptReconnect when all attempts are exhausted
        attemptReconnect()
      }
    })

    return () => {
      mountedRef.current = false
      // Bug 2 fix: unsubscribe the channel to prevent stacked callbacks on effect re-runs
      channel.unsubscribe()
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
        setConnectionStatus('auth_expired')
      }
    })
    return () => subscription.unsubscribe()
  }, [supabaseRef])

  return { connectionStatus }
}
