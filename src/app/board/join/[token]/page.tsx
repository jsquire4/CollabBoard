import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

interface JoinPageProps {
  params: Promise<{ token: string }>
}

export default async function JoinPage({ params }: JoinPageProps) {
  const { token } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?redirect=/board/join/${token}`)
  }

  // Use RPC to join — bypasses RLS since the user isn't a member yet
  const { data: boardId, error } = await supabase.rpc('join_board_via_link', {
    p_token: token,
  })

  if (error || !boardId) {
    return (
      <div style={{ maxWidth: '400px', margin: '100px auto', textAlign: 'center' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '12px' }}>Invalid or Expired Link</h1>
        <p style={{ color: '#666', marginBottom: '24px' }}>
          This share link is no longer active or doesn&apos;t exist.
        </p>
        <a href="/boards" style={{ color: '#2196F3', textDecoration: 'none', fontWeight: 500 }}>
          Go to My Boards
        </a>
      </div>
    )
  }

  redirect(`/board/${boardId}`)
}
