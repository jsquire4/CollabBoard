'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { OnlineUser } from './usePresence'

export interface BoardPresenceUser extends OnlineUser {
  status?: 'active' | 'idle'
}

/**
 * Returns presence info for a board: count and list of online users.
 * Does NOT track our own presence — we're viewing the list, not the board.
 * Status: 'active' | 'idle' from presence payload if present; otherwise treats online as 'active'.
 *
 * Manages its own channel lifecycle to avoid listener accumulation.
 */
export function useBoardPresenceCount(
  boardId: string,
  options?: { enabled?: boolean }
): {
  count: number
  onlineUsers: BoardPresenceUser[]
} {
  const enabled = options?.enabled ?? true
  const [onlineUsers, setOnlineUsers] = useState<BoardPresenceUser[]>([])
  const supabaseRef = useRef(createClient())

  useEffect(() => {
    if (!enabled) {
      setOnlineUsers([])
      return
    }

    const supabase = supabaseRef.current
    const channel = supabase.channel(`board:${boardId}`, {
      config: { private: true },
    })

    const syncState = () => {
      const state = channel.presenceState<BoardPresenceUser>()
      const deduped = new Map<string, BoardPresenceUser>()
      for (const key of Object.keys(state)) {
        for (const p of state[key]) {
          deduped.set(p.user_id, {
            ...p,
            status: (p as BoardPresenceUser).status ?? 'active',
          })
        }
      }
      setOnlineUsers(Array.from(deduped.values()))
    }

    channel
      .on('presence', { event: 'sync' }, syncState)
      .on('presence', { event: 'join' }, syncState)
      .on('presence', { event: 'leave' }, syncState)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') syncState()
      })

    return () => {
      // removeChannel unsubscribes AND removes all listeners in one call
      supabase.removeChannel(channel)
    }
  }, [boardId, enabled])

  return { count: onlineUsers.length, onlineUsers }
}
