'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BoardRole } from '@/types/sharing'
import { OnlineUser } from '@/hooks/usePresence'
import { GridSettingsPopover } from './GridSettingsPopover'

type BoardSettingsUpdate = {
  grid_size?: number
  grid_subdivisions?: number
  grid_visible?: boolean
  snap_to_grid?: boolean
  grid_style?: string
  canvas_color?: string
  grid_color?: string
  subdivision_color?: string
}

interface BoardTopBarProps {
  boardId: string
  boardName: string
  userRole: BoardRole
  onShareClick: () => void
  onlineUsers?: OnlineUser[]
  gridSize?: number
  gridSubdivisions?: number
  gridVisible?: boolean
  snapToGrid?: boolean
  gridStyle?: string
  canvasColor?: string
  gridColor?: string
  subdivisionColor?: string
  onUpdateBoardSettings?: (updates: BoardSettingsUpdate) => void
  uiDarkMode?: boolean
  onToggleDarkMode?: () => void
}

export function BoardTopBar({
  boardId,
  boardName,
  userRole,
  onShareClick,
  onlineUsers,
  gridSize = 40,
  gridSubdivisions = 1,
  gridVisible = true,
  snapToGrid = false,
  gridStyle = 'lines',
  canvasColor = '#e8ecf1',
  gridColor = '#b4becd',
  subdivisionColor = '#b4becd',
  onUpdateBoardSettings,
  uiDarkMode = false,
  onToggleDarkMode,
}: BoardTopBarProps) {
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(boardName)
  const [renameError, setRenameError] = useState<string | null>(null)

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
    const { error } = await supabase.from('boards').update({ name: trimmed }).eq('id', boardId)
    if (error) {
      setName(boardName)
      setRenameError('Failed to rename board')
      setTimeout(() => setRenameError(null), 3000)
      return
    }
    setEditing(false)
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 border-parchment-border bg-parchment dark:border-white/10 dark:bg-[#111827]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push('/boards')}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition text-charcoal/70 hover:bg-parchment-dark dark:text-parchment/60 dark:hover:bg-white/10"
          title="Back to boards"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Boards
        </button>
        <div className="h-5 w-px bg-parchment-border dark:bg-white/10" />
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
            className="w-48 rounded border border-navy px-2 py-1 text-sm font-semibold outline-none focus:ring-2 focus:ring-navy/20 bg-parchment text-charcoal dark:bg-[#111827] dark:text-parchment"
          />
        ) : (
          <button
            type="button"
            onClick={() => isOwner && setEditing(true)}
            className="group flex items-center gap-1 rounded px-2 py-1 text-sm font-semibold transition truncate max-w-64 text-charcoal hover:bg-parchment-dark dark:text-parchment dark:hover:bg-white/10"
            title={isOwner ? 'Click to rename' : boardName}
            style={{ cursor: isOwner ? 'pointer' : 'default' }}
          >
            {name}
            {isOwner && (
              <svg
                className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-40 transition-opacity"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            )}
          </button>
        )}
        {renameError && (
          <span className="text-xs text-red-600">{renameError}</span>
        )}

        {/* Grid settings popover button */}
        {onUpdateBoardSettings && (
          <>
            <div className="h-5 w-px bg-parchment-border dark:bg-white/10" />
            <GridSettingsPopover
              gridSize={gridSize}
              gridSubdivisions={gridSubdivisions}
              gridVisible={gridVisible}
              snapToGrid={snapToGrid}
              gridStyle={gridStyle}
              canvasColor={canvasColor}
              gridColor={gridColor}
              subdivisionColor={subdivisionColor}
              onUpdate={onUpdateBoardSettings}
              dark={uiDarkMode}
            />
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        {userRole === 'viewer' && (
          <span className="rounded px-2 py-1 text-xs font-medium bg-parchment-dark text-charcoal/70 dark:bg-[#111827] dark:text-parchment/60">
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
        {/* Dark mode toggle */}
        {onToggleDarkMode && (
          <button
            type="button"
            onClick={onToggleDarkMode}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition text-charcoal/70 hover:bg-parchment-dark dark:text-amber-400 dark:hover:bg-white/10"
            title={uiDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {uiDarkMode ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m8.66-13.66l-.71.71M4.05 19.95l-.71.71M21 12h-1M4 12H3m16.66 7.66l-.71-.71M4.05 4.05l-.71-.71M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
        )}
        {canManage && (
          <button
            type="button"
            onClick={onShareClick}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition text-charcoal/70 hover:bg-parchment-dark dark:text-parchment/60 dark:hover:bg-white/10"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share
          </button>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-lg px-3 py-2 text-sm font-medium transition text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
        >
          Logout
        </button>
      </div>
    </header>
  )
}

