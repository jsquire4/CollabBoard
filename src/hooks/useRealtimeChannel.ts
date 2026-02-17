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
      supabase.removeChannel(ch)
      setChannel(null)
    }
  }, [boardId])

  return channel
}
