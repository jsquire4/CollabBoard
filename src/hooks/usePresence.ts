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
  status?: 'active' | 'idle'
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

  // Register presence sync listener
  useEffect(() => {
    if (!channel) return

    // sync fires after presenceState is updated — full reconciliation
    const syncState = () => {
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
    }

    // join/leave fire BEFORE presenceState is updated, so use the
    // callback payload directly for immediate incremental updates.
    const handleJoin = ({ newPresences }: { key: string; newPresences: OnlineUser[]; currentPresences: OnlineUser[] }) => {
      setOnlineUsers(prev => {
        const map = new Map(prev.map(u => [u.user_id, u]))
        for (const p of newPresences) {
          if (p.user_id !== userId) map.set(p.user_id, p)
        }
        return Array.from(map.values())
      })
    }

    const handleLeave = ({ leftPresences }: { key: string; leftPresences: OnlineUser[]; currentPresences: OnlineUser[] }) => {
      const leftIds = new Set(leftPresences.map(p => p.user_id))
      setOnlineUsers(prev => prev.filter(u => !leftIds.has(u.user_id)))
    }

    channel.on('presence', { event: 'sync' }, syncState)
    channel.on('presence', { event: 'join' }, handleJoin)
    channel.on('presence', { event: 'leave' }, handleLeave)

    // Untrack immediately on tab close/refresh so other users see the leave instantly
    const handleBeforeUnload = () => {
      if ((channel as unknown as { state: string }).state === 'joined') {
        channel.untrack()
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [channel, userId])

  const presencePayloadRef = useRef<OnlineUser | null>(null)

  // trackPresence — called by useConnectionManager on every SUBSCRIBED event
  // (initial + reconnections). channel.track() is idempotent so safe to call repeatedly.
  const trackPresence = useCallback(() => {
    if (!channel) return
    const channelState = (channel as unknown as { state: string }).state
    if (channelState !== 'joined') {
      console.warn(`[Realtime] trackPresence skipped: channel state is '${channelState}'`)
      return
    }

    const color = getColorForUser(userId)
    const payload: OnlineUser = {
      user_id: userId,
      display_name: displayName,
      color,
      role: userRole,
      status: presencePayloadRef.current?.status ?? 'active',
    }
    presencePayloadRef.current = payload
    channel.track(payload)
  }, [channel, userId, displayName, userRole])

  // updatePresence — update status (active/idle) for activity indicator on board cards
  const updatePresence = useCallback((status: 'active' | 'idle') => {
    if (!channel || !presencePayloadRef.current) return
    if ((channel as unknown as { state: string }).state !== 'joined') return
    const next = { ...presencePayloadRef.current, status }
    presencePayloadRef.current = next
    channel.track(next)
  }, [channel])

  return { onlineUsers, trackPresence, updatePresence }
}
