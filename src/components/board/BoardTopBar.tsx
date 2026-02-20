'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BoardRole } from '@/types/sharing'
import { OnlineUser } from '@/hooks/usePresence'
import { useClickOutside } from '@/hooks/useClickOutside'

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
            className="rounded px-2 py-1 text-sm font-semibold transition truncate max-w-64 text-charcoal hover:bg-parchment-dark dark:text-parchment dark:hover:bg-white/10"
            title={isOwner ? 'Click to rename' : boardName}
            style={{ cursor: isOwner ? 'pointer' : 'default' }}
          >
            {name}
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

/* ── Grid Settings Popover ── */

const GRID_PRESETS: { name: string; canvas: string; grid: string; sub: string }[] = [
  { name: 'Default',    canvas: '#e8ecf1', grid: '#b4becd', sub: '#b4becd' },
  { name: 'Light',      canvas: '#f8fafc', grid: '#cbd5e1', sub: '#e2e8f0' },
  { name: 'White',      canvas: '#ffffff', grid: '#d1d5db', sub: '#e5e7eb' },
  { name: 'Blueprint',  canvas: '#1e3a5f', grid: '#3b82f6', sub: '#2563eb' },
  { name: 'Dark',       canvas: '#1C2333', grid: '#475569', sub: '#334155' },
  { name: 'Warm',       canvas: '#fef3c7', grid: '#d97706', sub: '#f59e0b' },
  { name: 'Green',      canvas: '#d1fae5', grid: '#059669', sub: '#34d399' },
  { name: 'Lavender',   canvas: '#ede9fe', grid: '#8b5cf6', sub: '#a78bfa' },
]

const GRID_PALETTE = [
  '#e8ecf1', '#f1f5f9', '#f8fafc', '#ffffff',
  '#dbeafe', '#e0e7ff', '#ede9fe', '#fce7f3',
  '#d1fae5', '#fef3c7', '#fee2e2', '#e5e7eb',
  '#b4becd', '#94a3b8', '#64748b', '#334155',
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899',
  '#10b981', '#f59e0b', '#ef4444', '#1e293b',
]

function GridSettingsPopover({
  gridSize, gridSubdivisions, gridVisible, snapToGrid,
  gridStyle, canvasColor, gridColor, subdivisionColor,
  onUpdate, dark = false,
}: {
  gridSize: number
  gridSubdivisions: number
  gridVisible: boolean
  snapToGrid: boolean
  gridStyle: string
  canvasColor: string
  gridColor: string
  subdivisionColor: string
  onUpdate: (updates: BoardSettingsUpdate) => void
  dark?: boolean
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  useClickOutside([panelRef, btnRef], open, () => setOpen(false))

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left })
    }
    setOpen(!open)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition ${
          open ? 'bg-navy/10 text-navy' : 'text-charcoal/70 hover:bg-parchment-dark dark:text-parchment/60 dark:hover:bg-white/10'
        }`}
        title="Grid settings"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16M6 4v16M12 4v16M18 4v16" />
        </svg>
        <span>Grid Options</span>
      </button>
      {open && (
        <div
          ref={panelRef}
          onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
          className={`fixed z-[300] w-64 rounded-xl border p-3 shadow-lg ring-1 ring-black/10 dark:ring-white/10 ${dark ? 'border-white/10 bg-[#111827]' : 'border-parchment-border bg-parchment'}`}
          style={{ top: pos.top, left: pos.left }}
        >
          <div className={`mb-2 text-[10px] font-semibold uppercase tracking-wider ${dark ? 'text-parchment/60' : 'text-charcoal/70'}`}>
            Grid Settings
          </div>

          {/* Toggle row: Grid Visible + Snap */}
          <div className="flex gap-1.5 mb-3">
            <button
              type="button"
              onClick={() => onUpdate({ grid_visible: !gridVisible })}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                gridVisible ? 'bg-navy/10 text-navy' : dark ? 'bg-white/10 text-parchment/60 hover:bg-white/20' : 'bg-parchment-dark text-charcoal/70 hover:bg-parchment-border'
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16M6 4v16M12 4v16M18 4v16" />
              </svg>
              {gridVisible ? 'Grid On' : 'Grid Off'}
            </button>
            <button
              type="button"
              onClick={() => onUpdate({ snap_to_grid: !snapToGrid })}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                snapToGrid ? 'bg-navy/10 text-navy' : dark ? 'bg-white/10 text-parchment/60 hover:bg-white/20' : 'bg-parchment-dark text-charcoal/70 hover:bg-parchment-border'
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v4m0 12v4M2 12h4m12 0h4" />
              </svg>
              {snapToGrid ? 'Snap On' : 'Snap Off'}
            </button>
          </div>

          {/* Grid Style — toggle buttons (independently selectable) */}
          <div className="mb-3">
            <div className={`mb-1 text-xs ${dark ? 'text-parchment/60' : 'text-charcoal/70'}`}>Style</div>
            <div className="flex gap-1">
              {(['lines', 'dots'] as const).map(style => {
                const active = gridStyle === style || gridStyle === 'both'
                return (
                  <button
                    key={style}
                    type="button"
                    onClick={() => {
                      const hasLines = style === 'lines' ? !active : (gridStyle === 'lines' || gridStyle === 'both')
                      const hasDots = style === 'dots' ? !active : (gridStyle === 'dots' || gridStyle === 'both')
                      onUpdate({ grid_style: hasLines && hasDots ? 'both' : hasLines ? 'lines' : hasDots ? 'dots' : gridStyle })
                    }}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition ${
                      active
                        ? 'bg-navy/10 text-navy'
                        : dark ? 'bg-white/10 text-parchment/60 hover:bg-white/20' : 'bg-parchment-dark text-charcoal/70 hover:bg-parchment-border'
                    }`}
                  >
                    {style === 'lines' ? 'Lines' : 'Dots'}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Interval + Subdivisions row */}
          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <div className={`mb-1 text-xs ${dark ? 'text-parchment/60' : 'text-charcoal/70'}`}>Interval</div>
              <select
                value={gridSize}
                onChange={(e) => onUpdate({ grid_size: Number(e.target.value) })}
                className={`w-full rounded-lg border px-2 py-1.5 text-xs font-medium outline-none focus:border-navy focus:ring-1 focus:ring-navy/20 ${
                  dark ? 'border-white/10 bg-[#111827] text-parchment/60' : 'border-parchment-border bg-parchment text-charcoal/70'
                }`}
              >
                {[10, 20, 40, 50, 80, 100].map((s) => (
                  <option key={s} value={s}>{s}px</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <div className={`mb-1 text-xs ${dark ? 'text-parchment/60' : 'text-charcoal/70'}`}>Subdivisions</div>
              <select
                value={gridSubdivisions}
                onChange={(e) => onUpdate({ grid_subdivisions: Number(e.target.value) })}
                className={`w-full rounded-lg border px-2 py-1.5 text-xs font-medium outline-none focus:border-navy focus:ring-1 focus:ring-navy/20 ${
                  dark ? 'border-white/10 bg-[#111827] text-parchment/60' : 'border-parchment-border bg-parchment text-charcoal/70'
                }`}
              >
                <option value={1}>None</option>
                <option value={2}>½</option>
                <option value={3}>⅓</option>
                <option value={4}>¼</option>
                <option value={8}>⅛</option>
              </select>
            </div>
          </div>

          {/* Theme button — opens color/preset flyout */}
          <GridThemeFlyout
            canvasColor={canvasColor}
            gridColor={gridColor}
            subdivisionColor={subdivisionColor}
            onUpdate={onUpdate}
            dark={dark}
          />
        </div>
      )}
    </>
  )
}

/* ── Grid Theme Flyout (presets + custom colors) ── */

function GridThemeFlyout({
  canvasColor, gridColor, subdivisionColor, onUpdate, dark = false,
}: {
  canvasColor: string
  gridColor: string
  subdivisionColor: string
  onUpdate: (updates: BoardSettingsUpdate) => void
  dark?: boolean
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  useClickOutside([panelRef, btnRef], open, () => setOpen(false))

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      // Position to the right of the button, or below if near right edge
      const spaceRight = window.innerWidth - rect.right
      if (spaceRight > 280) {
        setPos({ top: rect.top, left: rect.right + 4 })
      } else {
        setPos({ top: rect.bottom + 4, left: Math.max(8, rect.left - 200) })
      }
    }
    setOpen(!open)
  }

  const activePreset = GRID_PRESETS.find(
    p => p.canvas === canvasColor && p.grid === gridColor && p.sub === subdivisionColor
  )

  return (
    <div className={`border-t pt-2 ${dark ? 'border-white/10' : 'border-parchment-border'}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
          open ? 'bg-navy/10 text-navy' : dark ? 'text-parchment/60 hover:bg-white/10' : 'text-charcoal/70 hover:bg-parchment-dark'
        }`}
      >
        <span className="flex gap-px">
          <span className="h-4 w-4 rounded-l border border-parchment-border/60" style={{ backgroundColor: canvasColor }} />
          <span className="h-4 w-4 border-y border-parchment-border/60" style={{ backgroundColor: gridColor }} />
          <span className="h-4 w-4 rounded-r border border-parchment-border/60" style={{ backgroundColor: subdivisionColor }} />
        </span>
        <span>{activePreset?.name ?? 'Custom'} Theme</span>
        <svg className="ml-auto h-3 w-3 text-charcoal/70 dark:text-parchment/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {open && (
        <div
          ref={panelRef}
          onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
          className={`fixed z-[400] w-64 rounded-xl border p-3 shadow-lg ring-1 ring-black/10 dark:ring-white/10 ${dark ? 'border-white/10 bg-[#111827]' : 'border-parchment-border bg-parchment'}`}
          style={{ top: pos.top, left: pos.left }}
        >
          <div className={`mb-2 text-[10px] font-semibold uppercase tracking-wider ${dark ? 'text-parchment/60' : 'text-charcoal/70'}`}>
            Grid Theme
          </div>

          {/* Presets */}
          <div className="mb-3">
            <div className={`mb-1.5 text-xs ${dark ? 'text-parchment/60' : 'text-charcoal/70'}`}>Presets</div>
            <div className="flex flex-wrap gap-1">
              {GRID_PRESETS.map(preset => {
                const isActive = canvasColor === preset.canvas && gridColor === preset.grid && subdivisionColor === preset.sub
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => onUpdate({ canvas_color: preset.canvas, grid_color: preset.grid, subdivision_color: preset.sub })}
                    className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium transition ${
                      isActive
                        ? 'bg-navy/10 text-navy ring-1 ring-navy/30'
                        : dark ? 'bg-white/10 text-parchment/60 hover:bg-white/20' : 'bg-parchment-dark text-charcoal/70 hover:bg-parchment-border'
                    }`}
                    title={preset.name}
                  >
                    <span className="flex gap-px">
                      <span className="h-3 w-3 rounded-l-sm border border-parchment-border/50" style={{ backgroundColor: preset.canvas }} />
                      <span className="h-3 w-3 border-y border-parchment-border/50" style={{ backgroundColor: preset.grid }} />
                      <span className="h-3 w-3 rounded-r-sm border border-parchment-border/50" style={{ backgroundColor: preset.sub }} />
                    </span>
                    {preset.name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Custom colors */}
          <div className={`border-t pt-2 ${dark ? 'border-white/10' : 'border-parchment-border'}`}>
            <div className={`mb-1.5 text-xs ${dark ? 'text-parchment/60' : 'text-charcoal/70'}`}>Custom</div>
            <GridColorRow label="Canvas" color={canvasColor} onChange={(c) => onUpdate({ canvas_color: c })} dark={dark} />
            <GridColorRow label="Grid lines" color={gridColor} onChange={(c) => onUpdate({ grid_color: c })} dark={dark} />
            <GridColorRow label="Subdivisions" color={subdivisionColor} onChange={(c) => onUpdate({ subdivision_color: c })} dark={dark} />
          </div>
        </div>
      )}
    </div>
  )
}

function GridColorRow({ label, color, onChange, dark = false }: { label: string; color: string; onChange: (c: string) => void; dark?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const pickerRef = useRef<HTMLInputElement>(null)
  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-xs ${dark ? 'text-parchment/60 hover:bg-white/10' : 'text-charcoal/70 hover:bg-parchment-dark'}`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full border ${dark ? 'border-white/20' : 'border-parchment-border'}`}
          style={{ backgroundColor: color }}
        />
        <span>{label}</span>
        <svg className={`ml-auto h-3 w-3 transition ${expanded ? 'rotate-180' : ''} ${dark ? 'text-parchment/60' : 'text-charcoal/70'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="mt-1 ml-6">
          <div className="grid grid-cols-8 gap-1">
            {GRID_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { onChange(c); setExpanded(false) }}
                className={`h-4 w-4 rounded-full transition hover:scale-110 ${
                  c === color ? `ring-2 ring-navy ${dark ? 'ring-offset-[#111827]' : ''} ring-offset-1` : ''
                }`}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
            {/* Custom color picker trigger */}
            <button
              type="button"
              onClick={() => pickerRef.current?.click()}
              className={`h-4 w-4 rounded-full border border-dashed flex items-center justify-center hover:scale-110 transition ${dark ? 'border-white/20 bg-white/10' : 'border-parchment-border bg-parchment'}`}
              title="Custom color"
            >
              <svg className={`h-2.5 w-2.5 ${dark ? 'text-parchment/60' : 'text-charcoal/70'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
              </svg>
            </button>
          </div>
          <input
            ref={pickerRef}
            type="color"
            value={color}
            onChange={(e) => { onChange(e.target.value); setExpanded(false) }}
            className="sr-only"
            tabIndex={-1}
          />
        </div>
      )}
    </div>
  )
}
