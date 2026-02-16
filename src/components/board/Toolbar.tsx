'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface ToolbarProps {
  boardId: string
  boardName: string
  onAddStickyNote: () => void
  onAddRectangle: () => void
  onAddCircle: () => void
  selectedId: string | null
  selectedColor?: string
  colors: string[]
  onColorChange: (color: string) => void
  onDelete: () => void
  onDuplicate: () => void
}

export function Toolbar({
  boardId,
  boardName,
  onAddStickyNote,
  onAddRectangle,
  onAddCircle,
  selectedId,
  selectedColor,
  colors,
  onColorChange,
  onDelete,
  onDuplicate,
}: ToolbarProps) {
  const router = useRouter()
  const supabase = createClient()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(boardName)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const handleRename = async () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === boardName) {
      setName(boardName)
      setEditing(false)
      return
    }
    await supabase.from('boards').update({ name: trimmed }).eq('id', boardId)
    setEditing(false)
  }

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-white/90 backdrop-blur-sm shadow-lg rounded-xl px-4 py-2">
      <button
        onClick={() => router.push('/boards')}
        className="px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
        title="Back to boards"
      >
        ←
      </button>
      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={handleRename}
          onKeyDown={e => {
            if (e.key === 'Enter') handleRename()
            if (e.key === 'Escape') { setName(boardName); setEditing(false) }
          }}
          className="text-sm font-semibold text-gray-800 border border-blue-400 rounded px-2 py-1 outline-none w-40"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="px-2 py-1 text-sm font-semibold text-gray-800 rounded hover:bg-gray-100 transition-colors truncate max-w-48"
          title="Click to rename"
        >
          {name}
        </button>
      )}
      <div className="w-px h-6 bg-gray-300" />
      <button
        onClick={onAddStickyNote}
        className="px-4 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
      >
        Sticky Note
      </button>
      <button
        onClick={onAddRectangle}
        className="px-4 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
      >
        Rectangle
      </button>
      <button
        onClick={onAddCircle}
        className="px-4 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
      >
        Circle
      </button>

      {selectedId && (
        <>
          <div className="w-px h-6 bg-gray-300" />
          <div className="flex items-center gap-1">
            {colors.map(color => (
              <button
                key={color}
                onClick={() => onColorChange(color)}
                className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  backgroundColor: color,
                  borderColor: color === selectedColor ? '#333' : 'transparent',
                }}
                title={color}
              />
            ))}
          </div>
          <div className="w-px h-6 bg-gray-300" />
          <button
            onClick={onDuplicate}
            className="px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            title="Duplicate (Ctrl+D)"
          >
            Duplicate
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-2 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 transition-colors"
            title="Delete (Del)"
          >
            Delete
          </button>
        </>
      )}

      <div className="w-px h-6 bg-gray-300" />
      <button
        onClick={handleLogout}
        className="px-3 py-2 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 transition-colors"
      >
        Logout
      </button>
    </div>
  )
}
