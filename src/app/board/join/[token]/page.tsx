'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function JoinPage() {
  const params = useParams<{ token: string }>()
  const token = params.token
  const [error, setError] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)

  useEffect(() => {
    async function joinBoard() {
      const supabase = createClient()

      // Check for existing session
      const { data: { session } } = await supabase.auth.getSession()

      // If no session, sign in anonymously
      if (!session) {
        const { error: anonError } = await supabase.auth.signInAnonymously()
        if (anonError) {
          setError('Failed to create anonymous session. Please try again.')
          setIsAuthenticated(false)
          return
        }
      }

      // Join via API route (reads client IP server-side for block-on-remove)
      const res = await fetch('/api/board/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        credentials: 'include',
      })

      const data = await res.json().catch(() => ({}))
      const boardId = data.boardId

      if (!res.ok || !boardId) {
        setError('You do not have permissions to view this board.')
        const { data: { user } } = await supabase.auth.getUser()
        setIsAuthenticated(!!user && !user.is_anonymous)
        return
      }

      // Broadcast member_joined so Share dialog (if open) can refresh the member list
      try {
        const ch = supabase.channel(`board:${boardId}`, { config: { private: true } })
        await new Promise<void>((resolve) => {
          let resolved = false
          const done = () => { if (!resolved) { resolved = true; resolve() } }
          ch.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              ch.send({ type: 'broadcast', event: 'member_joined', payload: { board_id: boardId } }).catch(() => {})
              setTimeout(done, 100)
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              done()
            }
          })
          setTimeout(done, 2000)
        })
      } catch {
        // Non-fatal: Share dialog will show new member on next open
      }

      // Full page navigation (not router.replace) to ensure the board page
      // gets a clean Realtime WebSocket — SPA transitions break it.
      window.location.href = `/board/${boardId}`
    }

    joinBoard()
  }, [token])

  if (error) {
    return (
      <div style={{ maxWidth: '400px', margin: '100px auto', textAlign: 'center' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '12px' }}>
          Access Denied
        </h1>
        <p style={{ color: '#666', marginBottom: '24px' }}>{error}</p>
        {isAuthenticated === true && (
          <a
            href="/boards"
            style={{ color: '#2196F3', textDecoration: 'none', fontWeight: 500 }}
          >
            Go to My Boards
          </a>
        )}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '400px', margin: '100px auto', textAlign: 'center' }}>
      <p style={{ fontSize: '18px', color: '#666' }}>Joining board...</p>
    </div>
  )
}
