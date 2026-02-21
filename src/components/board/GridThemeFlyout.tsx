'use client'

import { useState, useRef } from 'react'
import { useClickOutside } from '@/hooks/useClickOutside'
import { GRID_PRESETS, GRID_PALETTE, BoardSettingsUpdate } from './gridConstants'

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

export function GridThemeFlyout({
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
