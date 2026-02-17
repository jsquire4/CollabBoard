import { fetchBoardsGrouped } from '@/lib/supabase/boardsApi'
import { BoardList } from '@/components/boards/BoardList'

export default async function BoardsPage() {
  const { myBoards, sharedWithMe } = await fetchBoardsGrouped()

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '48px 24px' }}>
      <BoardList initialMyBoards={myBoards} initialSharedBoards={sharedWithMe} />
    </div>
  )
}
