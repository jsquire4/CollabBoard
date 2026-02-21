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
    const ch = supabase.channel(`board:${boardId}`, {
      config: { private: true },
    })

    setChannel(ch)

    return () => {
      if ((ch as unknown as { state: string }).state === 'joined') {
        ch.untrack()
      }
      // Synchronously remove the channel from the socket's internal channel list
      // BEFORE the async unsubscribe completes. This prevents Supabase's
      // RealtimeClient.channel() topic-based deduplication from returning this
      // stale (leaving-state) channel when the effect re-runs (e.g. React Strict
      // Mode double-mount). Without this, subscribe() silently no-ops on the
      // stale channel because it only works when state === 'closed'.
      const socket = (ch as unknown as { socket: { _remove?: (c: RealtimeChannel) => void } }).socket
      if (typeof socket?._remove === 'function') {
        socket._remove(ch)
      }
      ch.unsubscribe()
      setChannel(null)
    }
  }, [boardId])

  return channel
}
