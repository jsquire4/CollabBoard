'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { RealtimeChannel } from '@supabase/supabase-js'
import { BoardRole } from '@/types/sharing'

const CURSOR_COLORS = [
  '#C2185B', '#7B1FA2', '#4527A0', '#283593',
  '#1565C0', '#00838F', '#00695C', '#2E7D32',
  '#558B2F', '#E65100', '#BF360C', '#4E342E',
  '#B71C1C', '#37474F', '#1A237E', '#004D40',
]

export interface OnlineUser {
  user_id: string
  display_name: string
  color: string
  role: BoardRole
}

/** Hash the full userId string to distribute colors evenly across the palette. */
export function getColorForUser(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0
  }
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length]
}

export function usePresence(
  channel: RealtimeChannel | null,
  userId: string,
  userRole: BoardRole,
  displayName: string
) {
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([])
  const trackedRef = useRef(false)

  // Register presence sync listener
  useEffect(() => {
    if (!channel) return

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<OnlineUser>()
      const deduped = new Map<string, OnlineUser>()
      for (const key of Object.keys(state)) {
        for (const presence of state[key]) {
          if (presence.user_id !== userId) {
            deduped.set(presence.user_id, presence)
          }
        }
      }
      setOnlineUsers(Array.from(deduped.values()))
    })

    return () => {
      trackedRef.current = false
    }
  }, [channel, userId])

  // trackPresence — called by BoardClient once the channel is confirmed SUBSCRIBED
  const trackPresence = useCallback(() => {
    if (!channel || trackedRef.current) return
    trackedRef.current = true

    const color = getColorForUser(userId)

    channel.track({
      user_id: userId,
      display_name: displayName,
      color,
      role: userRole,
    })
  }, [channel, userId, displayName, userRole])

  return { onlineUsers, trackPresence }
}
