import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      gap: '16px',
    }}>
      <h1 style={{ fontSize: '48px', fontWeight: 700, margin: 0 }}>CollabBoard</h1>
      <p style={{ fontSize: '18px', color: '#666', margin: 0 }}>
        A real-time collaborative whiteboard
      </p>
      <div style={{ marginTop: '24px' }}>
        {user ? (
          <Link
            href="/boards"
            style={{
              padding: '12px 32px',
              fontSize: '16px',
              background: '#2196F3',
              color: '#fff',
              borderRadius: '8px',
              textDecoration: 'none',
            }}
          >
            Go to My Boards
          </Link>
        ) : (
          <Link
            href="/login"
            style={{
              padding: '12px 32px',
              fontSize: '16px',
              background: '#2196F3',
              color: '#fff',
              borderRadius: '8px',
              textDecoration: 'none',
            }}
          >
            Sign In
          </Link>
        )}
      </div>
    </div>
  )
}
