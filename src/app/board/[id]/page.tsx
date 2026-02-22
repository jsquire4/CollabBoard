import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fetchBoardRole } from '@/lib/supabase/boardsApi'
import { BoardClient } from '@/components/board/BoardClient'
import { getUserDisplayName } from '@/lib/userUtils'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface BoardPageProps {
  params: Promise<{ id: string }>
}

export default async function BoardPage({ params }: BoardPageProps) {
  const { id } = await params

  // Reject non-UUID paths before hitting the DB
  if (!UUID_RE.test(id)) notFound()

  const supabase = await createClient()

  // Authenticate first to prevent board ID enumeration
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: board } = await supabase
    .from('boards')
    .select('id, name, grid_size, grid_subdivisions, grid_visible, snap_to_grid, grid_style, canvas_color, grid_color, subdivision_color')
    .eq('id', id)
    .single()

  if (!board) notFound()

  const userRole = await fetchBoardRole(id)

  if (!userRole) notFound()

  const displayName = getUserDisplayName(user)

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
