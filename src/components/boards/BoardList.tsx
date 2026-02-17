'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { BoardWithRole } from '@/types/sharing'
import { createClient } from '@/lib/supabase/client'
import { BoardCard } from './BoardCard'
import { CreateBoardDialog } from './CreateBoardDialog'
import { EmptyState } from './EmptyState'

interface BoardListProps {
  initialMyBoards: BoardWithRole[]
  initialSharedBoards: BoardWithRole[]
}

export function BoardList({ initialMyBoards, initialSharedBoards }: BoardListProps) {
  const [myBoards, setMyBoards] = useState<BoardWithRole[]>(initialMyBoards)
  const [sharedBoards, setSharedBoards] = useState<BoardWithRole[]>(initialSharedBoards)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [showNameInput, setShowNameInput] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const handleCreate = async () => {
    const name = newName.trim() || 'Untitled Board'
    setCreating(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('boards')
        .insert({ name, created_by: user.id })
        .select()
        .single()

      if (error) {
        setError(`Failed to create board: ${error.message || 'Unknown error'}`)
        return
      }
      setNewName('')
      setShowNameInput(false)
      router.push(`/board/${data.id}`)
    } finally {
      setCreating(false)
    }
  }

  const handleRename = async (id: string) => {
    const name = editName.trim()
    if (!name) {
      setEditingId(null)
      return
    }

    const { error } = await supabase
      .from('boards')
      .update({ name })
      .eq('id', id)

    if (!error) {
      setMyBoards(prev => prev.map(b => b.id === id ? { ...b, name } : b))
    }
    setEditingId(null)
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('boards')
      .delete()
      .eq('id', id)

    if (error) return
    setMyBoards(prev => prev.filter(b => b.id !== id))
  }

  const handleLeaveBoard = async (boardId: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('board_members')
      .delete()
      .eq('board_id', boardId)
      .eq('user_id', user.id)

    if (error) return
    setSharedBoards(prev => prev.filter(b => b.id !== boardId))
  }

  const handleDuplicateBoard = async (boardId: string, boardName: string) => {
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      let copyName = `${boardName} - Copy`
      let counter = 2
      const allBoards = [...myBoards, ...sharedBoards]
      while (allBoards.some(b => b.name === copyName)) {
        copyName = `${boardName} - Copy (${counter})`
        counter++
      }

      const { data: newBoard, error: boardError } = await supabase
        .from('boards')
        .insert({ name: copyName, created_by: user.id })
        .select()
        .single()

      if (boardError || !newBoard) {
        setError('Failed to duplicate board.')
        return
      }

      const { data: sourceObjects } = await supabase
        .from('board_objects')
        .select('*')
        .eq('board_id', boardId)

      if (sourceObjects && sourceObjects.length > 0) {
        const copies = sourceObjects.map(({ id, created_at, updated_at, board_id, ...rest }) => ({
          ...rest,
          board_id: newBoard.id,
          created_by: user.id,
        }))
        await supabase.from('board_objects').insert(copies)
      }

      setMyBoards(prev => [{ ...newBoard, role: 'owner' as const }, ...prev])
    } catch {
      setError('Failed to duplicate board.')
    }
  }

  const hasNoBoards = myBoards.length === 0 && sharedBoards.length === 0

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          My Boards
        </h1>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Logout
        </button>
      </header>

      {showNameInput ? (
        <CreateBoardDialog
          newName={newName}
          onNameChange={setNewName}
          onCreate={handleCreate}
          onCancel={() => { setShowNameInput(false); setNewName('') }}
          creating={creating}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowNameInput(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Board
        </button>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {hasNoBoards ? (
        <EmptyState />
      ) : (
        <>
          {myBoards.length > 0 && (
            <section>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {myBoards.map((board) => (
                  <BoardCard
                    key={board.id}
                    board={board}
                    editingId={editingId}
                    editName={editName}
                    onEditNameChange={setEditName}
                    onRename={handleRename}
                    onEditingCancel={() => setEditingId(null)}
                    onDoubleClickTitle={(b) => { setEditingId(b.id); setEditName(b.name) }}
                    onDuplicate={handleDuplicateBoard}
                    onDelete={handleDelete}
                    onLeave={handleLeaveBoard}
                    onNavigate={(id) => router.push(`/board/${id}`)}
                  />
                ))}
              </div>
            </section>
          )}

          {sharedBoards.length > 0 && (
            <section>
              <h2 className="mb-4 text-lg font-semibold text-slate-900">Shared with Me</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sharedBoards.map((board) => (
                  <BoardCard
                    key={board.id}
                    board={board}
                    editingId={editingId}
                    editName={editName}
                    onEditNameChange={setEditName}
                    onRename={handleRename}
                    onEditingCancel={() => setEditingId(null)}
                    onDoubleClickTitle={(b) => { setEditingId(b.id); setEditName(b.name) }}
                    onDuplicate={handleDuplicateBoard}
                    onDelete={handleDelete}
                    onLeave={handleLeaveBoard}
                    onNavigate={(id) => router.push(`/board/${id}`)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
