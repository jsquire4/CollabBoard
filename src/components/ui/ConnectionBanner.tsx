'use client'

import { useState, useEffect } from 'react'

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting' | 'auth_expired'

interface ConnectionBannerProps {
  status: ConnectionStatus
  /** Delay in ms before showing the reconnecting banner (default 2000) */
  showDelay?: number
  /** Called when user clicks Retry (disconnected state). Triggers reconnect attempt. */
  onRetry?: () => void
}

export function ConnectionBanner({ status, showDelay = 2000, onRetry }: ConnectionBannerProps) {
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
      text: 'Connection lost. Your work is saved.',
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
    <div role="status" aria-live="polite" className={`${bg} flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-sm font-medium text-white`}>
      <span>{text}</span>
      {status === 'disconnected' && onRetry && (
        <>
          <button
            type="button"
            onClick={onRetry}
            aria-label="Retry connection"
            className="rounded border border-white/80 px-2 py-0.5 font-medium hover:bg-white/20"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            aria-label="Refresh page"
            className="rounded border border-white/80 px-2 py-0.5 font-medium hover:bg-white/20"
          >
            Refresh
          </button>
        </>
      )}
    </div>
  )
}
