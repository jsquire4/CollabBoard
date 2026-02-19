import { fetchBoardsGrouped } from '@/lib/supabase/boardsApi'
import { BoardList } from '@/components/boards/BoardList'
import { BoardsHeader } from '@/components/boards/BoardsHeader'
import { BoardsPageWrapper } from '@/components/boards/BoardsPageWrapper'

export default async function BoardsPage() {
  const { myBoards, sharedWithMe } = await fetchBoardsGrouped()

  return (
    <BoardsPageWrapper>
      <BoardsHeader />
      <div className="mx-auto max-w-5xl px-6 py-12 sm:px-8">
        <BoardList initialMyBoards={myBoards} initialSharedBoards={sharedWithMe} />
      </div>
    </BoardsPageWrapper>
  )
}
