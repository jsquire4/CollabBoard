'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BoardRole } from '@/types/sharing'
import { OnlineUser } from '@/hooks/usePresence'

interface BoardTopBarProps {
  boardId: string
  boardName: string
  userRole: BoardRole
  onShareClick: () => void
  onlineUsers?: OnlineUser[]
}

export function BoardTopBar({
  boardId,
  boardName,
  userRole,
  onShareClick,
  onlineUsers,
}: BoardTopBarProps) {
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(boardName)

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
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push('/boards')}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          title="Back to boards"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Boards
        </button>
        <div className="h-5 w-px bg-slate-200" />
        {editing && isOwner ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename()
              if (e.key === 'Escape') {
                setName(boardName)
                setEditing(false)
              }
            }}
            className="w-48 rounded border border-indigo-500 px-2 py-1 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        ) : (
          <button
            type="button"
            onClick={() => isOwner && setEditing(true)}
            className="rounded px-2 py-1 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 truncate max-w-64"
            title={isOwner ? 'Click to rename' : boardName}
            style={{ cursor: isOwner ? 'pointer' : 'default' }}
          >
            {name}
          </button>
        )}
        {canManage && (
          <>
            <div className="h-5 w-px bg-slate-200" />
            <button
              type="button"
              onClick={onShareClick}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Share
            </button>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        {userRole === 'viewer' && (
          <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">
            View only
          </span>
        )}
        {onlineUsers && onlineUsers.length > 0 && (
          <div className="flex items-center gap-1">
            {onlineUsers.map((user) => (
              <div
                key={user.user_id}
                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: user.color }}
                title={`${user.display_name} (${user.role})`}
              >
                {user.display_name.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
        >
          Logout
        </button>
      </div>
    </header>
  )
}
