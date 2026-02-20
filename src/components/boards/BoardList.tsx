'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { BoardWithRole } from '@/types/sharing'
import { createClient } from '@/lib/supabase/client'
import { useDarkModeValue } from '@/hooks/useDarkMode'
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

  const dk = useDarkModeValue()
  const [activeTab, setActiveTab] = useState<'boards' | 'files'>('boards')


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
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-parchment-border">
        <button
          onClick={() => setActiveTab('boards')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'boards'
              ? 'border-navy text-navy'
              : 'border-transparent text-charcoal/50 hover:text-charcoal'
          }`}
        >

          My Boards
        </button>
        <button
          onClick={() => setActiveTab('files')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'files'
              ? (dk ? 'border-indigo-400 text-indigo-400' : 'border-indigo-600 text-indigo-600')
              : (dk ? 'border-transparent text-slate-400 hover:text-slate-200' : 'border-transparent text-slate-500 hover:text-slate-700')
          }`}
        >
          My Files
        </button>
      </div>

      {/* My Files empty state */}
      {activeTab === 'files' && (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <svg className={`w-12 h-12 ${dk ? 'text-slate-600' : 'text-slate-200'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className={`text-base font-medium ${dk ? 'text-slate-300' : 'text-slate-600'}`}>No files yet.</p>
          <p className={`text-sm ${dk ? 'text-slate-500' : 'text-slate-400'}`}>
            Upload files from a board to see them here.
          </p>
        </div>
      )}

      {activeTab === 'boards' && (
        <>
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
        </>
      )}
    </div>
  )
}
