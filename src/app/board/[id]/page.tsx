import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fetchBoardRole } from '@/lib/supabase/boardsApi'
import { BoardClient } from '@/components/board/BoardClient'

interface BoardPageProps {
  params: Promise<{ id: string }>
}

export default async function BoardPage({ params }: BoardPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: board } = await supabase
    .from('boards')
    .select('id, name, grid_size, grid_subdivisions, grid_visible, snap_to_grid, grid_style, canvas_color, grid_color, subdivision_color')
    .eq('id', id)
    .single()

  if (!board) notFound()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) notFound()

  const userRole = await fetchBoardRole(id)

  if (!userRole) notFound()

  const displayName = user.user_metadata?.full_name
    || user.user_metadata?.name
    || user.email?.split('@')[0]
    || 'Anonymous'

  return (
    <BoardClient
      userId={user.id}
      boardId={board.id}
      boardName={board.name}
      userRole={userRole}
      displayName={displayName}
      initialGridSize={board.grid_size}
      initialGridSubdivisions={board.grid_subdivisions}
      initialGridVisible={board.grid_visible}
      initialSnapToGrid={board.snap_to_grid}
      initialGridStyle={board.grid_style}
      initialCanvasColor={board.canvas_color}
      initialGridColor={board.grid_color}
      initialSubdivisionColor={board.subdivision_color}
    />
  )
}
