'use client'

import { useEffect, useState, useRef } from 'react'
import { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

/**
 * Creates a Supabase Realtime channel for a board but does NOT subscribe.
 * The caller must call channel.subscribe() after all .on() listeners
 * have been registered by downstream hooks.
 */
export function useRealtimeChannel(boardId: string): RealtimeChannel | null {
  const [channel, setChannel] = useState<RealtimeChannel | null>(null)
  const supabaseRef = useRef(createClient())

  useEffect(() => {
    const supabase = supabaseRef.current
    let cancelled = false
    let createdChannel: RealtimeChannel | null = null

    // Prime the auth session before creating the channel. During client-side
    // navigation (e.g. /boards → /board/[id]), the singleton Supabase client's
    // Realtime transport may not have a fresh token — getSession() forces a
    // token refresh if needed and ensures realtime.setAuth() is called via the
    // onAuthStateChange listener before we create/subscribe to the channel.
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      const token = data.session?.access_token

      // Explicitly set the auth token on the Realtime transport.
      // We cannot rely on onAuthStateChange(INITIAL_SESSION) having already
      // called setAuth() — the event may not have fired yet, or the socket
      // may have been disconnected (clearing the token) by a previous
      // board's cleanup. setAuth() is idempotent and safe to call repeatedly.
      if (token) {
        supabase.realtime.setAuth(token)
      }

      const ch = supabase.channel(`board:${boardId}`)
      createdChannel = ch
      setChannel(ch)
    })

    return () => {
      cancelled = true
      // Disconnect the socket FIRST. This closes the WebSocket entirely,
      // which is cleaner than ch.unsubscribe() because:
      // 1. unsubscribe() fires a synchronous CLOSED callback that
      //    useConnectionManager (which hasn't cleaned up yet due to React
      //    effect ordering) misinterprets as a real disconnection, triggering
      //    a spurious reconnect attempt
      // 2. disconnect() kills the WebSocket without per-channel callbacks
      // 3. subscribe() on the next mount will auto-connect a fresh WebSocket
      supabase.realtime.disconnect()

      const ch = createdChannel
      if (ch) {
        // Remove the channel from the socket's internal channel list to
        // prevent Supabase's topic-based deduplication from returning this
        // stale channel when the effect re-runs (e.g. React Strict Mode).
        const socket = (ch as unknown as { socket: { _remove?: (c: RealtimeChannel) => void } }).socket
        if (typeof socket?._remove === 'function') {
          socket._remove(ch)
        }
      }
      setChannel(null)
    }
  }, [boardId])

  return channel
}
