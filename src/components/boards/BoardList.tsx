'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BoardWithRole } from '@/types/sharing'
import { createClient } from '@/lib/supabase/client'

interface BoardListProps {
  initialMyBoards: BoardWithRole[]
  initialSharedBoards: BoardWithRole[]
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  editor: 'Editor',
  viewer: 'Viewer',
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
  const supabase = createClient()

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

  const renderBoardCard = (board: BoardWithRole) => {
    const isOwner = board.role === 'owner'

    return (
      <div
        key={board.id}
        style={{
          border: '1px solid #e0e0e0',
          borderRadius: '12px',
          padding: '20px',
          cursor: 'pointer',
          transition: 'box-shadow 0.15s',
        }}
        onClick={() => router.push(`/board/${board.id}`)}
        onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.1)')}
        onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
          {editingId === board.id ? (
            <input
              autoFocus
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleRename(board.id)
                if (e.key === 'Escape') setEditingId(null)
              }}
              onBlur={() => handleRename(board.id)}
              onClick={e => e.stopPropagation()}
              style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: 600,
                border: '1px solid #2196F3',
                borderRadius: '4px',
                padding: '2px 6px',
                outline: 'none',
                width: '100%',
                marginRight: '8px',
              }}
            />
          ) : (
            <h3
              style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}
              onDoubleClick={e => {
                if (!isOwner) return
                e.stopPropagation()
                setEditingId(board.id)
                setEditName(board.name)
              }}
              title={isOwner ? 'Double-click to rename' : undefined}
            >
              {board.name}
            </h3>
          )}
          <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
            {isOwner && (
              <>
                <button
                  onClick={e => {
                    e.stopPropagation()
                    handleDuplicateBoard(board.id, board.name)
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#999',
                    fontSize: '14px',
                    padding: '0 4px',
                  }}
                  title="Duplicate board"
                >
                  Duplicate
                </button>
                <button
                  onClick={e => {
                    e.stopPropagation()
                    handleDelete(board.id)
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#999',
                    fontSize: '18px',
                    padding: '0 4px',
                  }}
                  title="Delete board"
                >
                  ×
                </button>
              </>
            )}
            {!isOwner && (
              <button
                onClick={e => {
                  e.stopPropagation()
                  handleLeaveBoard(board.id)
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#999',
                  fontSize: '14px',
                  padding: '0 4px',
                }}
                title="Leave board"
              >
                Leave
              </button>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
          <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>
            Updated {new Date(board.updated_at).toLocaleDateString()}
          </p>
          {!isOwner && (
            <span style={{
              fontSize: '11px',
              color: '#666',
              background: '#f0f0f0',
              padding: '2px 8px',
              borderRadius: '10px',
            }}>
              {ROLE_LABELS[board.role]}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 700, margin: 0 }}>My Boards</h1>
        <button
          onClick={handleLogout}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            background: 'none',
            border: '1px solid #ccc',
            borderRadius: '8px',
            cursor: 'pointer',
            color: '#666',
          }}
        >
          Logout
        </button>
      </div>

      {showNameInput ? (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') { setShowNameInput(false); setNewName('') }
            }}
            placeholder="Board name"
            style={{
              padding: '10px 16px',
              fontSize: '15px',
              border: '1px solid #ccc',
              borderRadius: '8px',
              outline: 'none',
              width: '240px',
            }}
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            style={{
              padding: '10px 20px',
              fontSize: '15px',
              background: '#2196F3',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: creating ? 'wait' : 'pointer',
            }}
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
          <button
            onClick={() => { setShowNameInput(false); setNewName('') }}
            style={{
              padding: '10px 16px',
              fontSize: '15px',
              background: 'none',
              border: '1px solid #ccc',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowNameInput(true)}
          style={{
            padding: '10px 24px',
            fontSize: '15px',
            background: '#2196F3',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            marginBottom: '24px',
          }}
        >
          + New Board
        </button>
      )}

      {error && (
        <p style={{ color: '#d32f2f', marginBottom: '16px' }}>{error}</p>
      )}

      {myBoards.length === 0 && sharedBoards.length === 0 ? (
        <p style={{ color: '#888' }}>No boards yet. Create one to get started!</p>
      ) : (
        <>
          {myBoards.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
              gap: '16px',
              marginBottom: '32px',
            }}>
              {myBoards.map(renderBoardCard)}
            </div>
          )}

          {sharedBoards.length > 0 && (
            <>
              <h2 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 16px' }}>Shared with Me</h2>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                gap: '16px',
              }}>
                {sharedBoards.map(renderBoardCard)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
