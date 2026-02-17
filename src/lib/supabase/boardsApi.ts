import { createClient } from './server'
import { Board } from '@/types/board'
import { BoardRole, BoardWithRole } from '@/types/sharing'

export async function fetchBoards(): Promise<Board[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('boards')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch boards:', error.message)
    return []
  }
  return data ?? []
}

export async function fetchBoardsGrouped(): Promise<{
  myBoards: BoardWithRole[]
  sharedWithMe: BoardWithRole[]
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { myBoards: [], sharedWithMe: [] }

  // Accept any pending invites for this user's email
  await acceptPendingInvites(user.id, user.email!)

  // Fetch boards with role via board_members join
  const { data, error } = await supabase
    .from('board_members')
    .select('role, boards(id, name, created_by, created_at, updated_at)')
    .eq('user_id', user.id)
    .order('added_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch boards:', error.message)
    return { myBoards: [], sharedWithMe: [] }
  }

  const myBoards: BoardWithRole[] = []
  const sharedWithMe: BoardWithRole[] = []

  for (const row of data ?? []) {
    const board = row.boards as unknown as Board
    if (!board) continue
    const item: BoardWithRole = { ...board, role: row.role as BoardRole }
    if (row.role === 'owner') {
      myBoards.push(item)
    } else {
      sharedWithMe.push(item)
    }
  }

  // Sort by updated_at descending
  const sortDesc = (a: BoardWithRole, b: BoardWithRole) =>
    new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  myBoards.sort(sortDesc)
  sharedWithMe.sort(sortDesc)

  return { myBoards, sharedWithMe }
}

async function acceptPendingInvites(userId: string, email: string) {
  const supabase = await createClient()

  // Find pending invites for this email
  const { data: invites } = await supabase
    .from('board_invites')
    .select('*')
    .eq('email', email)

  if (!invites || invites.length === 0) return

  for (const invite of invites) {
    // Add user as member (ignore conflict if already member)
    await supabase
      .from('board_members')
      .upsert({
        board_id: invite.board_id,
        user_id: userId,
        role: invite.role,
        added_by: invite.invited_by,
      }, { onConflict: 'board_id,user_id' })

    // Delete the invite
    await supabase
      .from('board_invites')
      .delete()
      .eq('id', invite.id)
  }
}

export async function fetchBoardRole(boardId: string): Promise<BoardRole | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('board_members')
    .select('role')
    .eq('board_id', boardId)
    .eq('user_id', user.id)
    .single()

  return (data?.role as BoardRole) ?? null
}

export async function createBoard(name: string): Promise<Board> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('boards')
    .insert({ name, created_by: user.id })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteBoard(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('boards')
    .delete()
    .eq('id', id)

  if (error) throw error
}
