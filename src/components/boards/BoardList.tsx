'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { BoardWithRole } from '@/types/sharing'
import { createClient } from '@/lib/supabase/client'
import { useDarkModeValue } from '@/hooks/useDarkMode'
import { BoardCard } from './BoardCard'
import { NewBoardCard } from './NewBoardCard'

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

  const dk = useDarkModeValue()

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

  return (
    <div className="space-y-8">
      {error && (
        <p className={`rounded-lg px-4 py-3 text-sm ${dk ? 'bg-red-900/30 text-red-400' : 'bg-red-50 text-red-700'}`}>{error}</p>
      )}

      <section>
        <h2 className={`mb-4 text-2xl font-bold tracking-tight sm:text-3xl ${dk ? 'text-white' : 'text-slate-900'}`}>
          My Boards
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <NewBoardCard
                isCreating={showNameInput}
                newName={newName}
                onNameChange={setNewName}
                onCreate={handleCreate}
                onCancel={() => { setShowNameInput(false); setNewName('') }}
                onClick={() => setShowNameInput(true)}
                dark={dk}
              />
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
                    dark={dk}
                  />
                ))}
        </div>
      </section>

      {sharedBoards.length > 0 && (
        <section className={`mt-16 border-t pt-12 ${dk ? 'border-slate-700' : 'border-slate-200'}`}>
          <h2 className={`mb-4 text-2xl font-bold tracking-tight sm:text-3xl ${dk ? 'text-white' : 'text-slate-900'}`}>
            Boards Shared with Me
          </h2>
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
                    dark={dk}
                  />
                ))}
          </div>
        </section>
      )}
    </div>
  )
}
