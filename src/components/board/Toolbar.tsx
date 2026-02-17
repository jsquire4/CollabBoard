'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BoardRole } from '@/types/sharing'
import { OnlineUser } from '@/hooks/usePresence'

interface ToolbarProps {
  boardId: string
  boardName: string
  userRole: BoardRole
  onAddStickyNote: () => void
  onAddRectangle: () => void
  onAddCircle: () => void
  onAddFrame: () => void
  hasSelection: boolean
  multiSelected: boolean
  selectedColor?: string
  colors: string[]
  onColorChange: (color: string) => void
  onDelete: () => void
  onDuplicate: () => void
  onGroup: () => void
  onUngroup: () => void
  canGroup: boolean
  canUngroup: boolean
  onShareClick: () => void
  onlineUsers?: OnlineUser[]
}

export function Toolbar({
  boardId,
  boardName,
  userRole,
  onAddStickyNote,
  onAddRectangle,
  onAddCircle,
  onAddFrame,
  hasSelection,
  multiSelected,
  selectedColor,
  colors,
  onColorChange,
  onDelete,
  onDuplicate,
  onGroup,
  onUngroup,
  canGroup,
  canUngroup,
  onShareClick,
  onlineUsers,
}: ToolbarProps) {
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(boardName)

  const canEdit = userRole !== 'viewer'
  const isOwner = userRole === 'owner'
  const canManage = userRole === 'owner' || userRole === 'manager'

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
      {editing && isOwner ? (
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
          onClick={() => isOwner && setEditing(true)}
          className="px-2 py-1 text-sm font-semibold text-gray-800 rounded hover:bg-gray-100 transition-colors truncate max-w-48"
          title={isOwner ? 'Click to rename' : boardName}
          style={{ cursor: isOwner ? 'pointer' : 'default' }}
        >
          {name}
        </button>
      )}

      {!canEdit && (
        <>
          <div className="w-px h-6 bg-gray-300" />
          <span className="px-2 py-1 text-xs font-medium text-gray-500 bg-gray-100 rounded">
            View only
          </span>
        </>
      )}

      {canEdit && (
        <>
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
          <button
            onClick={onAddFrame}
            className="px-4 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Frame
          </button>
        </>
      )}

      {canEdit && hasSelection && (
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

      {canEdit && canGroup && (
        <>
          <div className="w-px h-6 bg-gray-300" />
          <button
            onClick={onGroup}
            className="px-3 py-2 text-sm font-medium text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
            title="Group (Ctrl+G)"
          >
            Group
          </button>
        </>
      )}

      {canEdit && canUngroup && (
        <button
          onClick={onUngroup}
          className="px-3 py-2 text-sm font-medium text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
          title="Ungroup (Ctrl+Shift+G)"
        >
          Ungroup
        </button>
      )}

      {onlineUsers && onlineUsers.length > 0 && (
        <>
          <div className="w-px h-6 bg-gray-300" />
          <div className="flex items-center gap-1">
            {onlineUsers.map(user => (
              <div
                key={user.user_id}
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: user.color }}
                title={`${user.display_name} (${user.role})`}
              >
                {user.display_name.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>
        </>
      )}

      {canManage && (
        <>
          <div className="w-px h-6 bg-gray-300" />
          <button
            onClick={onShareClick}
            className="px-3 py-2 text-sm font-medium text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
          >
            Share
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
