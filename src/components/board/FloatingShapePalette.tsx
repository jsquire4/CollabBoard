'use client'

import { useRef, useEffect } from 'react'
import type { BoardObjectType } from '@/types/board'

interface PaletteItem {
  type: BoardObjectType
  label: string
  iconPath: string
}

const PALETTE_ITEMS: PaletteItem[] = [
  { type: 'rectangle', label: 'Rectangle', iconPath: 'M3 3h18v18H3z' },
  { type: 'circle', label: 'Circle', iconPath: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20' },
  { type: 'sticky_note', label: 'Sticky Note', iconPath: 'M4 4h16v13.17L14.17 22H4V4z M14 17v5 M14 22h6' },
  { type: 'triangle', label: 'Triangle', iconPath: 'M12 3L22 21H2z' },
]

interface FloatingShapePaletteProps {
  x: number
  y: number
  onSelectShape: (type: BoardObjectType) => void
  onDismiss: () => void
}

export function FloatingShapePalette({ x, y, onSelectShape, onDismiss }: FloatingShapePaletteProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onDismiss()
      }
    }
    window.addEventListener('keydown', handleKey)
    // Delay click listener to avoid immediate dismiss
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleClick)
    }, 100)
    return () => {
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('mousedown', handleClick)
      clearTimeout(timer)
    }
  }, [onDismiss])

  // Clamp to viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x - 60, window.innerWidth - 140),
    top: Math.min(y + 8, window.innerHeight - 50),
    zIndex: 300,
  }

  return (
    <div
      ref={ref}
      className="rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
      style={style}
    >
      <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 px-2 py-1">
        Add shape
      </div>
      <div className="flex gap-0.5">
        {PALETTE_ITEMS.map((item) => (
          <button
            key={item.type}
            type="button"
            onClick={() => onSelectShape(item.type)}
            className="flex flex-col items-center justify-center rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-100"
            title={item.label}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d={item.iconPath} />
            </svg>
          </button>
        ))}
      </div>
    </div>
  )
}
