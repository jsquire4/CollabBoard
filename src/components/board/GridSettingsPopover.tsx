'use client'

import { useState, useRef } from 'react'
import { useClickOutside } from '@/hooks/useClickOutside'
import { GridThemeFlyout } from './GridThemeFlyout'

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

export function GridSettingsPopover({
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
