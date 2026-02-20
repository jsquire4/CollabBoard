'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { BoardWithRole } from '@/types/sharing'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { BoardCard } from './BoardCard'
import { NewBoardCard } from './NewBoardCard'

interface BoardListProps {
  initialMyBoards: BoardWithRole[]
  initialSharedBoards: BoardWithRole[]
}

export function BoardList({ initialMyBoards, initialSharedBoards }: BoardListProps) {
  const [myBoards, setMyBoards] = useState<BoardWithRole[]>(initialMyBoards)
  const [sharedBoards, setSharedBoards] = useState<BoardWithRole[]>(initialSharedBoards)
  const [newName, setNewName] = useState('')
  const [showNameInput, setShowNameInput] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  const handleCreate = async () => {
    const name = newName.trim() || 'Untitled Board'
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('boards')
      .insert({ name, created_by: user.id })
      .select()
      .single()

    if (error) {
      toast.error('Failed to create board')
      return
    }
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
        toast.error('Failed to duplicate board')
        return
      }

      const { data: sourceObjects } = await supabase
        .from('board_objects')
        .select('*')
        .eq('board_id', boardId)
        .is('deleted_at', null)

      if (sourceObjects && sourceObjects.length > 0) {
        // Build old ID → new ID mapping so FK refs point to the new board's objects
        const idMap = new Map<string, string>()
        for (const obj of sourceObjects) {
          idMap.set(obj.id, crypto.randomUUID())
        }
        const remap = (oldId: string | null | undefined) => oldId ? (idMap.get(oldId) ?? null) : null

        const copies = sourceObjects.map(({ id, created_at, updated_at, board_id, ...rest }) => ({
          ...rest,
          id: idMap.get(id),
          board_id: newBoard.id,
          created_by: user.id,
          parent_id: remap(rest.parent_id),
          connect_start_id: remap(rest.connect_start_id),
          connect_end_id: remap(rest.connect_end_id),
        }))
        const CHUNK_SIZE = 300
        for (let i = 0; i < copies.length; i += CHUNK_SIZE) {
          const { error: chunkError } = await supabase.from('board_objects').insert(copies.slice(i, i + CHUNK_SIZE))
          if (chunkError) {
            toast.error('Failed to duplicate board objects')
            try {
              await supabase.from('board_objects').delete().eq('board_id', newBoard.id)
              await supabase.from('boards').delete().eq('id', newBoard.id)
            } catch {
              // Cleanup failed — orphaned board may remain
            }
            return
          }
        }
      }

      setMyBoards(prev => [{ ...newBoard, role: 'owner' as const }, ...prev])
    } catch {
      toast.error('Failed to duplicate board')
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-4 text-2xl font-bold tracking-tight text-charcoal sm:text-3xl">
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
