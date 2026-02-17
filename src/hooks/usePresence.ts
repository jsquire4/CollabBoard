'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { RealtimeChannel } from '@supabase/supabase-js'
import { BoardRole } from '@/types/sharing'

const CURSOR_COLORS = [
  '#E91E63', '#9C27B0', '#673AB7', '#3F51B5',
  '#009688', '#FF5722', '#795548', '#607D8B',
]

export interface OnlineUser {
  user_id: string
  display_name: string
  color: string
  role: BoardRole
}

export function getColorForUser(userId: string): string {
  const colorIndex = userId.charCodeAt(0) % CURSOR_COLORS.length
  return CURSOR_COLORS[colorIndex]
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
      const users: OnlineUser[] = []
      for (const key of Object.keys(state)) {
        for (const presence of state[key]) {
          if (presence.user_id !== userId) {
            users.push(presence)
          }
        }
      }
      setOnlineUsers(users)
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
