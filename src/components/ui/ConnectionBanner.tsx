'use client'

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting' | 'auth_expired'

interface ConnectionBannerProps {
  status: ConnectionStatus
}

export function ConnectionBanner({ status }: ConnectionBannerProps) {
  if (status === 'connected') return null

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
