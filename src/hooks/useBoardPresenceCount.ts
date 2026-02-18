'use client'

import { useEffect, useState } from 'react'
import { useRealtimeChannel } from './useRealtimeChannel'
import { OnlineUser } from './usePresence'

export type PresenceStatus = 'active' | 'idle' | 'offline'

export interface BoardPresenceUser extends OnlineUser {
  status?: 'active' | 'idle'
}

/**
 * Returns presence info for a board: count and list of online users.
 * Does NOT track our own presence — we're viewing the list, not the board.
 * Status: 'active' | 'idle' from presence payload if present; otherwise treats online as 'active'.
 */
export function useBoardPresenceCount(
  boardId: string,
  options?: { enabled?: boolean }
): {
  count: number
  onlineUsers: BoardPresenceUser[]
} {
  const enabled = options?.enabled ?? true
  const channel = useRealtimeChannel(boardId)
  const [onlineUsers, setOnlineUsers] = useState<BoardPresenceUser[]>([])

  useEffect(() => {
    if (!channel || !enabled) {
      if (!enabled) setOnlineUsers([])
      return
    }

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

    channel.on('presence', { event: 'sync' }, syncState)
    channel.on('presence', { event: 'join' }, syncState)
    channel.on('presence', { event: 'leave' }, syncState)

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') syncState()
    })

    return () => {
      channel.unsubscribe()
    }
  }, [channel, enabled])

  return { count: onlineUsers.length, onlineUsers }
}
