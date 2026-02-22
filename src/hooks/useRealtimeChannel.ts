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

      const ch = supabase.channel(`board:${boardId}`, {
        config: { private: true },
      })
      createdChannel = ch
      setChannel(ch)
    })

    return () => {
      cancelled = true
      // Do NOT call disconnect() — it kills the shared WebSocket. Board cards on
      // /boards use useBoardPresenceCount and need the same connection for presence.
      // useConnectionManager cleans up first (mounts after us) and calls
      // channel.unsubscribe(); we only remove the channel from the socket's list.
      const ch = createdChannel
      if (ch) {
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
