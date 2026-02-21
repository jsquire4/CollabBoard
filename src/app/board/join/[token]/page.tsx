'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function JoinPage() {
  const params = useParams<{ token: string }>()
  const token = params.token
  const [error, setError] = useState<string | null>(null)

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
          return
        }
      }

      // Join the board via RPC
      const { data: boardId, error: joinError } = await supabase.rpc('join_board_via_link', {
        p_token: token,
      })

      if (joinError || !boardId) {
        setError('This share link is no longer active or doesn\u2019t exist.')
        return
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
          Invalid or Expired Link
        </h1>
        <p style={{ color: '#666', marginBottom: '24px' }}>{error}</p>
        <a
          href="/boards"
          style={{ color: '#2196F3', textDecoration: 'none', fontWeight: 500 }}
        >
          Go to My Boards
        </a>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '400px', margin: '100px auto', textAlign: 'center' }}>
      <p style={{ fontSize: '18px', color: '#666' }}>Joining board...</p>
    </div>
  )
}
