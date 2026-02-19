import { createClient } from './server'
import { Board } from '@/types/board'
import { BoardRole, BoardWithRole, BoardCardSummary } from '@/types/sharing'

export async function fetchBoardsGrouped(): Promise<{
  myBoards: (BoardWithRole & { summary?: BoardCardSummary })[]
  sharedWithMe: (BoardWithRole & { summary?: BoardCardSummary })[]
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
    .limit(200)

  if (error) {
    console.error('Failed to fetch boards:', error.message)
    return { myBoards: [], sharedWithMe: [] }
  }

  const myBoards: (BoardWithRole & { summary?: BoardCardSummary })[] = []
  const sharedWithMe: (BoardWithRole & { summary?: BoardCardSummary })[] = []

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

  // Fetch card summaries for all boards
  const allBoardIds = [...myBoards, ...sharedWithMe].map((b) => b.id)
  if (allBoardIds.length > 0) {
    const { data: summaries } = await supabase.rpc('get_boards_card_summaries', {
      p_board_ids: allBoardIds,
    })
    const summaryMap = new Map<string, BoardCardSummary>()
    for (const row of summaries ?? []) {
      summaryMap.set((row as { board_id: string }).board_id, (row as { summary: BoardCardSummary }).summary)
    }
    for (const b of myBoards) {
      b.summary = summaryMap.get(b.id)
    }
    for (const b of sharedWithMe) {
      b.summary = summaryMap.get(b.id)
    }
  }

  return { myBoards, sharedWithMe }
}

async function acceptPendingInvites(userId: string, email: string) {
  const supabase = await createClient()

  // Find pending invites for this email (normalized to lowercase)
  const { data: invites } = await supabase
    .from('board_invites')
    .select('*')
    .eq('email', email.toLowerCase())

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

