'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { BoardWithRole } from '@/types/sharing'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { BoardCard } from './BoardCard'
import { NewBoardCard } from './NewBoardCard'
import { duplicateBoard } from '@/lib/supabase/boardDuplication'

interface BoardListProps {
  initialMyBoards: BoardWithRole[]
  initialSharedBoards: BoardWithRole[]
}

export function BoardList({ initialMyBoards, initialSharedBoards }: BoardListProps) {
  const [myBoards, setMyBoards] = useState<BoardWithRole[]>(initialMyBoards)
  const [sharedBoards, setSharedBoards] = useState<BoardWithRole[]>(initialSharedBoards)
  const [newName, setNewName] = useState('')
  const [showNameInput, setShowNameInput] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  const handleCreate = async () => {
    const name = newName.trim() || 'Untitled Board'
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setIsSubmitting(true)
    const { data, error } = await supabase
      .from('boards')
      .insert({ name, created_by: user.id })
      .select()
      .single()

    if (error) {
      toast.error('Failed to create board')
      setIsSubmitting(false)
      return
    }
    setIsSubmitting(false)
    setNewName('')
    setShowNameInput(false)
    router.push(`/board/${data.id}`)
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

    if (error) {
      toast.error('Failed to rename board')
    } else {
      setMyBoards(prev => prev.map(b => b.id === id ? { ...b, name } : b))
      setSharedBoards(prev => prev.map(b => b.id === id ? { ...b, name } : b))
    }
    setEditingId(null)
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('boards')
      .delete()
      .eq('id', id)

    if (error) {
      toast.error('Failed to delete board')
      return
    }
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

    if (error) {
      toast.error('Failed to leave board')
      return
    }
    setSharedBoards(prev => prev.filter(b => b.id !== boardId))
  }

  const handleDuplicateBoard = async (boardId: string, boardName: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const allNames = [...myBoards, ...sharedBoards].map(b => b.name)
      const result = await duplicateBoard(supabase, boardId, boardName, allNames, user.id)
      if (!result) {
        toast.error('Failed to duplicate board')
        return
      }
      setMyBoards(prev => [{ ...result, role: 'owner' as const }, ...prev])
    } catch {
      toast.error('Failed to duplicate board')
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-4 text-2xl font-bold tracking-tight sm:text-3xl text-charcoal">
          My Boards
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NewBoardCard
            isCreating={showNameInput}
            isSubmitting={isSubmitting}
            newName={newName}
            onNameChange={setNewName}
            onCreate={handleCreate}
            onCancel={() => { setShowNameInput(false); setNewName('') }}
            onClick={() => setShowNameInput(true)}
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
            />
          ))}
        </div>
      </section>

      {sharedBoards.length > 0 && (
        <section className="mt-16 border-t border-parchment-border pt-12">
          <h2 className="mb-4 text-2xl font-bold tracking-tight text-charcoal sm:text-3xl">
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
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
