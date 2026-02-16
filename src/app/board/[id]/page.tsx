import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BoardClient } from '@/components/board/BoardClient'

interface BoardPageProps {
  params: Promise<{ id: string }>
}

export default async function BoardPage({ params }: BoardPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: board } = await supabase
    .from('boards')
    .select('id, name')
    .eq('id', id)
    .single()

  if (!board) notFound()

  const { data: { user } } = await supabase.auth.getUser()

  return <BoardClient userId={user?.id || ''} boardId={board.id} boardName={board.name} />
}
