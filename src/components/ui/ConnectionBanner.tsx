'use client'

import { useState, useEffect } from 'react'

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting' | 'auth_expired'

interface ConnectionBannerProps {
  status: ConnectionStatus
  /** Delay in ms before showing the reconnecting banner (default 2000) */
  showDelay?: number
}

export function ConnectionBanner({ status, showDelay = 2000 }: ConnectionBannerProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (status === 'connected') {
      setVisible(false)
      return
    }
    // Show auth_expired and disconnected immediately
    if (status === 'auth_expired' || status === 'disconnected') {
      setVisible(true)
      return
    }
    // Delay showing the reconnecting banner so brief interruptions don't flash it
    const timer = setTimeout(() => setVisible(true), showDelay)
    return () => clearTimeout(timer)
  }, [status, showDelay])

  if (!visible || status === 'connected') return null

  const config = {
    disconnected: {
      bg: 'bg-amber-500',
      text: 'Connection lost. Attempting to reconnect...',
    },
    reconnecting: {
      bg: 'bg-amber-500',
      text: 'Reconnecting...',
    },
    auth_expired: {
      bg: 'bg-red-600',
      text: 'Session expired. Please refresh the page to continue.',
    },
  }

  const { bg, text } = config[status]

  return (
    <div className={`${bg} px-4 py-2 text-center text-sm font-medium text-white`}>
      {text}
    </div>
  )
}
