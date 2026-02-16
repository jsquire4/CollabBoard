'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Board } from '@/types/board'
import { createClient } from '@/lib/supabase/client'

interface BoardListProps {
  initialBoards: Board[]
}

export function BoardList({ initialBoards }: BoardListProps) {
  const [boards, setBoards] = useState<Board[]>(initialBoards)
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
      setBoards(prev => prev.map(b => b.id === id ? { ...b, name } : b))
    }
    setEditingId(null)
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('boards')
      .delete()
      .eq('id', id)

    if (error) return
    setBoards(prev => prev.filter(b => b.id !== id))
  }

  const handleDuplicateBoard = async (boardId: string, boardName: string) => {
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Generate unique copy name
      let copyName = `${boardName} - Copy`
      let counter = 2
      while (boards.some(b => b.name === copyName)) {
        copyName = `${boardName} - Copy (${counter})`
        counter++
      }

      // Create new board
      const { data: newBoard, error: boardError } = await supabase
        .from('boards')
        .insert({ name: copyName, created_by: user.id })
        .select()
        .single()

      if (boardError || !newBoard) {
        setError('Failed to duplicate board.')
        return
      }

      // Copy all objects from source board
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

      setBoards(prev => [newBoard, ...prev])
    } catch {
      setError('Failed to duplicate board.')
    }
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

      {boards.length === 0 ? (
        <p style={{ color: '#888' }}>No boards yet. Create one to get started!</p>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
          gap: '16px',
        }}>
          {boards.map(board => (
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
                      e.stopPropagation()
                      setEditingId(board.id)
                      setEditName(board.name)
                    }}
                  >
                    {board.name}
                  </h3>
                )}
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
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
                </div>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#888' }}>
                Updated {new Date(board.updated_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
