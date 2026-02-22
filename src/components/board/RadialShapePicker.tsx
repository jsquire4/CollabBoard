'use client'

import { useRef, useEffect } from 'react'
import { useClickOutside } from '@/hooks/useClickOutside'
import type { BoardObjectType } from '@/types/board'

// ── Types ────────────────────────────────────────────────────────────────────

interface RadialItem {
  id: string
  label: string
  dbType: string
  defaultWidth: number
  defaultHeight: number
  iconPath: string
  overrides?: Record<string, unknown>
}

// ── Presets ──────────────────────────────────────────────────────────────────

const RADIAL_PRESETS: RadialItem[] = [
  {
    id: 'sticky_note',
    label: 'Sticky Note',
    dbType: 'sticky_note',
    defaultWidth: 150,
    defaultHeight: 150,
    iconPath: 'M4 4h16v13.17L14.17 22H4V4z',
  },
  {
    id: 'rectangle',
    label: 'Rectangle',
    dbType: 'rectangle',
    defaultWidth: 200,
    defaultHeight: 140,
    iconPath: 'M3 3h18v18H3z',
  },
  {
    id: 'circle',
    label: 'Circle',
    dbType: 'circle',
    defaultWidth: 120,
    defaultHeight: 120,
    iconPath: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  },
  {
    id: 'text_box',
    label: 'Text Box',
    dbType: 'rectangle',
    defaultWidth: 200,
    defaultHeight: 140,
    overrides: { color: 'transparent', text: '', corner_radius: 0, stroke_color: '#E8E3DA', stroke_dash: '[6,4]' },
    iconPath: 'M4 6h16 M4 6v12h16V6 M8 10h8 M8 14h5',
  },
  {
    id: 'arrow',
    label: 'Arrow',
    dbType: 'arrow',
    defaultWidth: 120,
    defaultHeight: 40,
    iconPath: 'M5 12h14M12 5l7 7-7 7',
  },
  {
    id: 'triangle',
    label: 'Triangle',
    dbType: 'triangle',
    defaultWidth: 100,
    defaultHeight: 90,
    iconPath: 'M12 2L2 22h20L12 2z',
  },
  {
    id: 'frame',
    label: 'Frame',
    dbType: 'frame',
    defaultWidth: 400,
    defaultHeight: 300,
    iconPath: 'M3 3h4 M17 3h4v4 M21 17v4h-4 M7 21H3v-4 M3 3v4 M7 21h10 M21 7v10 M3 7v10',
  },
  {
    id: 'table',
    label: 'Table',
    dbType: 'table',
    defaultWidth: 360,
    defaultHeight: 128,
    iconPath: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',
  },
]

// ── Interface ─────────────────────────────────────────────────────────────────

export interface RadialPickerState {
  triggerX: number
  triggerY: number
  canvasX: number
  canvasY: number
}

export interface RadialShapePickerProps {
  triggerX: number
  triggerY: number
  canvasX: number
  canvasY: number
  onDrawShape: (type: BoardObjectType, x: number, y: number, w: number, h: number) => void
  onClose: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RadialShapePicker({
  triggerX,
  triggerY,
  canvasX,
  canvasY,
  onDrawShape,
  onClose,
}: RadialShapePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Dismiss on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Dismiss on click outside
  useClickOutside(containerRef, true, onClose)

  // Viewport-clamped position — the picker div is 180×180px, centered on the trigger
  const RADIUS = 90
  const SIZE = RADIUS * 2
  const left = Math.max(8, Math.min(triggerX - RADIUS, window.innerWidth - SIZE - 8))
  const top = Math.max(8, Math.min(triggerY - RADIUS, window.innerHeight - SIZE - 8))

  const handleSelect = (item: RadialItem) => {
    try {
      onDrawShape(
        item.dbType as BoardObjectType,
        canvasX - item.defaultWidth / 2,
        canvasY - item.defaultHeight / 2,
        item.defaultWidth,
        item.defaultHeight,
      )
    } catch {
      // ignore draw errors — onClose always runs
    }
    onClose()
  }

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Shape picker"
      className="fixed z-[300]"
      style={{ left, top, width: SIZE, height: SIZE }}
    >
      {RADIAL_PRESETS.map((item, i) => {
        // Items are placed at 75% of RADIUS from center, starting from -90° (top),
        // evenly spaced at 45° intervals.
        const angle = (i / RADIAL_PRESETS.length) * 2 * Math.PI - Math.PI / 2
        const itemX = RADIUS + Math.cos(angle) * RADIUS * 0.75 - 28 // 28 = half of 56px button
        const itemY = RADIUS + Math.sin(angle) * RADIUS * 0.75 - 28

        return (
          <button
            key={item.id}
            type="button"
            aria-label={`Place ${item.label}`}
            onClick={() => handleSelect(item)}
            className="absolute flex flex-col items-center justify-center w-14 h-14 rounded-full bg-charcoal/95 border border-white/10 text-parchment/80 hover:bg-white/10 hover:text-parchment shadow-lg transition"
            style={{ left: itemX, top: itemY }}
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={item.iconPath} />
            </svg>
            <span className="text-[8px] mt-0.5 leading-tight">{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
