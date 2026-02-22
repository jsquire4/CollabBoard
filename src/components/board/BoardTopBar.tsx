'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BoardRole } from '@/types/sharing'
import { OnlineUser } from '@/hooks/usePresence'
import { GridSettingsPopover } from './GridSettingsPopover'
import { ZoomControls } from './ZoomControls'
import { BoardSettingsUpdate } from './gridConstants'

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
  gridStyle?: 'lines' | 'dots' | 'both'
  canvasColor?: string
  gridColor?: string
  subdivisionColor?: string
  onUpdateBoardSettings?: (updates: BoardSettingsUpdate) => void
  stageScale?: number
  onZoomIn?: () => void
  onZoomOut?: () => void
  onResetZoom?: () => void
  onToggleSnapToGrid?: () => void
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
  stageScale = 1,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onToggleSnapToGrid,
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
      {/* Left: back, board name, grid settings, snap, zoom */}
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

        <div className="h-5 w-px bg-parchment-border dark:bg-white/10" />

        {/* Grid settings popover */}
        {onUpdateBoardSettings && (
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
          />
        )}

        {/* Snap-to-grid indicator */}
        <button
          type="button"
          onClick={onToggleSnapToGrid}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
            snapToGrid
              ? 'bg-navy/10 text-navy dark:bg-navy/30 dark:text-parchment'
              : 'text-charcoal/50 hover:bg-parchment-dark dark:text-parchment/40 dark:hover:bg-white/10'
          }`}
          title={snapToGrid ? 'Snap to grid: ON' : 'Snap to grid: OFF'}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
          </svg>
          Snap
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${snapToGrid ? 'bg-emerald-500' : 'bg-charcoal/20 dark:bg-parchment/20'}`} />
        </button>

        <div className="h-5 w-px bg-parchment-border dark:bg-white/10" />

        {/* Zoom controls */}
        {onZoomIn && onZoomOut && onResetZoom && (
          <ZoomControls
            scale={stageScale}
            onZoomIn={onZoomIn}
            onZoomOut={onZoomOut}
            onReset={onResetZoom}
          />
        )}
      </div>

      {/* Right: users, share, logout */}
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

