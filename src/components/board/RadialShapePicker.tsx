'use client'

import { useRef, useEffect, useState } from 'react'
import { useClickOutside } from '@/hooks/useClickOutside'
import type { BoardObjectType, BoardObject } from '@/types/board'
import {
  STANDALONE_PRESETS,
  FRAME_PRESET,
  TABLE_PRESET,
  QUAD_PRESETS,
  TRIANGLE_PRESETS,
  LINE_PRESETS,
  SYMBOL_PRESETS,
  FLOWCHART_PRESETS,
  AGENT_PRESETS,
  DATA_PRESETS,
  type ShapePreset,
} from './shapePresets'

// ── Group definitions ────────────────────────────────────────────────────────

interface RadialGroup {
  id: string
  label: string
  iconPath: string
  presets: ShapePreset[]
}

const FILE_PRESET: ShapePreset = {
  id: 'file',
  label: 'File',
  dbType: 'file',
  defaultWidth: 300,
  defaultHeight: 200,
  iconPath: 'M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9l-7-7z M13 2v7h7',
}

// Keep only the right-facing block arrow — users can rotate to any direction
const SYMBOL_PRESETS_FILTERED = SYMBOL_PRESETS.filter(
  p => !['block_arrow_left', 'block_arrow_up', 'block_arrow_down'].includes(p.id),
)

// TODO: Re-enable the Agent group once the board agent feature is working.
// const AGENT_GROUP: RadialGroup = {
//   id: 'agent',
//   label: 'Agent',
//   iconPath: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
//   presets: [...AGENT_PRESETS, ...DATA_PRESETS],
// }

const RADIAL_GROUPS: RadialGroup[] = [
  {
    id: 'utility',
    label: 'Utility',
    iconPath: 'M4 4h16v13.17L14.17 22H4V4z M14 17v5 M14 22h6',
    presets: [
      STANDALONE_PRESETS.find(p => p.id === 'sticky_note')!,
      STANDALONE_PRESETS.find(p => p.id === 'text_box')!,
      FRAME_PRESET,
      TABLE_PRESET,
      FILE_PRESET,
    ],
  },
  {
    id: 'basic',
    label: 'Shapes',
    iconPath: 'M3 3h18v18H3z',
    presets: [
      QUAD_PRESETS.find(p => p.id === 'rectangle')!,
      QUAD_PRESETS.find(p => p.id === 'square')!,
      STANDALONE_PRESETS.find(p => p.id === 'circle')!,
      TRIANGLE_PRESETS.find(p => p.id === 'equilateral')!,
    ],
  },
  {
    id: 'lines',
    label: 'Lines',
    iconPath: 'M5 12h14M12 5l7 7-7 7',
    presets: LINE_PRESETS,
  },
  {
    id: 'special',
    label: 'Special',
    iconPath: 'M12 2l2.9 6.3 6.9.8-5 5.1 1.2 6.9L12 17.8 6 21.1l1.2-6.9-5-5.1 6.9-.8z',
    presets: [
      ...SYMBOL_PRESETS_FILTERED,
      QUAD_PRESETS.find(p => p.id === 'parallelogram')!,
      QUAD_PRESETS.find(p => p.id === 'rhombus')!,
      QUAD_PRESETS.find(p => p.id === 'trapezoid')!,
    ],
  },
  {
    id: 'flowchart',
    label: 'Flowchart',
    iconPath: 'M12 2l10 10-10 10L2 12z',
    presets: FLOWCHART_PRESETS,
  },
]

// ── Interface ────────────────────────────────────────────────────────────────

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
  onDrawShape: (type: BoardObjectType, x: number, y: number, w: number, h: number, overrides?: Partial<BoardObject>) => void
  onClose: () => void
}

// ── Layout constants ─────────────────────────────────────────────────────────

const RADIUS = 220
const SIZE = RADIUS * 2
const INNER_R = 95               // group button orbit
const OUTER_R = 175              // shape button orbit
const GROUP_SIZE = 88            // 2× original 44
const SHAPE_SIZE = 80            // 2× original 40
const CLOSE_SIZE = 36            // close button in the center
const ARC_SPACING = (28 * Math.PI) / 180 // 28° in radians

// ── Component ────────────────────────────────────────────────────────────────

export function RadialShapePicker({
  triggerX,
  triggerY,
  canvasX,
  canvasY,
  onDrawShape,
  onClose,
}: RadialShapePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  // Drives pop-out for group buttons on mount
  const [groupsRevealed, setGroupsRevealed] = useState(false)
  // Drives pop-out for shape buttons when a group is opened
  const [shapesRevealed, setShapesRevealed] = useState(false)
  // Increments on every group click so shape button keys are unique per
  // activation, forcing React to unmount → remount for a fresh animation.
  const [revealGen, setRevealGen] = useState(0)
  const raf2Ref = useRef(0)

  // Animate group buttons in on mount
  useEffect(() => {
    const raf1 = requestAnimationFrame(() => {
      raf2Ref.current = requestAnimationFrame(() => setGroupsRevealed(true))
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2Ref.current)
    }
  }, [])

  // Animate shape buttons when activeGroup changes
  useEffect(() => {
    if (!activeGroup) return
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => setShapesRevealed(true))
      raf2Ref.current = raf2
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2Ref.current)
    }
  }, [activeGroup, revealGen])

  // Dismiss on Escape — collapses active group first
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeGroup) {
          setActiveGroup(null)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, activeGroup])

  // Dismiss on click outside
  useClickOutside(containerRef, true, onClose)

  // Viewport-clamped position
  const left = Math.max(8, Math.min(triggerX - RADIUS, window.innerWidth - SIZE - 8))
  const top = Math.max(8, Math.min(triggerY - RADIUS, window.innerHeight - SIZE - 8))

  const handleSelect = (preset: ShapePreset) => {
    try {
      onDrawShape(
        preset.dbType,
        canvasX - preset.defaultWidth / 2,
        canvasY - preset.defaultHeight / 2,
        preset.defaultWidth,
        preset.defaultHeight,
        preset.overrides,
      )
    } catch {
      // ignore draw errors — onClose always runs
    }
    onClose()
  }

  const handleGroupClick = (groupId: string) => {
    // Reset shapesRevealed synchronously so it's batched into the same render
    // as the new activeGroup — new shape buttons mount already collapsed.
    setShapesRevealed(false)
    setRevealGen(g => g + 1)
    setActiveGroup(prev => (prev === groupId ? null : groupId))
  }

  // Active group data
  const activeGroupData = activeGroup
    ? RADIAL_GROUPS.find(g => g.id === activeGroup)
    : null

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Shape picker"
      className="fixed z-[300]"
      style={{ left, top, width: SIZE, height: SIZE }}
    >
      {/* Close button — dead center */}
      <button
        type="button"
        aria-label="Close shape picker"
        onClick={onClose}
        className="absolute rounded-full bg-red-600 hover:bg-red-500 shadow-lg flex items-center justify-center transition-colors duration-150"
        style={{
          left: RADIUS - CLOSE_SIZE / 2,
          top: RADIUS - CLOSE_SIZE / 2,
          width: CLOSE_SIZE,
          height: CLOSE_SIZE,
        }}
      >
        <svg
          className="h-4 w-4 text-white"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

      {/* Inner ring — group buttons */}
      {RADIAL_GROUPS.map((group, i) => {
        const angle = (i / RADIAL_GROUPS.length) * 2 * Math.PI - Math.PI / 2
        const halfBtn = GROUP_SIZE / 2
        const itemX = RADIUS + Math.cos(angle) * INNER_R - halfBtn
        const itemY = RADIUS + Math.sin(angle) * INNER_R - halfBtn
        const isActive = activeGroup === group.id
        const hasActive = activeGroup !== null

        // Active stays at scale 1, inactive siblings shrink when a group is open
        let scale = groupsRevealed ? 1 : 0.3
        if (groupsRevealed && hasActive && !isActive) scale = 0.85

        return (
          <button
            key={group.id}
            type="button"
            aria-label={group.label}
            onClick={() => handleGroupClick(group.id)}
            className={`absolute flex flex-col items-center justify-center rounded-full border ${
              isActive
                ? 'bg-navy border-leather text-parchment'
                : 'bg-navy border-navy/40 text-parchment/80 hover:border-parchment-border hover:text-parchment'
            }`}
            style={{
              left: itemX,
              top: itemY,
              width: GROUP_SIZE,
              height: GROUP_SIZE,
              opacity: groupsRevealed ? (hasActive && !isActive ? 0.45 : 1) : 0,
              transform: `scale(${scale})`,
              boxShadow: '0 4px 16px rgba(0,0,0,0.45), 0 1px 4px rgba(0,0,0,0.3)',
              transition: `opacity 140ms cubic-bezier(.34,1.56,.64,1) ${i * 30}ms, transform 140ms cubic-bezier(.34,1.56,.64,1) ${i * 30}ms, background-color 150ms, border-color 150ms`,
            }}
          >
            <svg
              className="h-7 w-7"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={group.iconPath} />
            </svg>
            <span className="text-[11px] mt-0.5 leading-tight">{group.label}</span>
          </button>
        )
      })}

      {/* Outer arc — shape buttons for active group */}
      {activeGroupData && (() => {
        const groupIndex = RADIAL_GROUPS.findIndex(g => g.id === activeGroup)
        const groupAngle = (groupIndex / RADIAL_GROUPS.length) * 2 * Math.PI - Math.PI / 2
        const presets = activeGroupData.presets
        const totalArc = (presets.length - 1) * ARC_SPACING
        const startAngle = groupAngle - totalArc / 2

        return presets.map((preset, i) => {
          const angle = startAngle + i * ARC_SPACING
          const halfBtn = SHAPE_SIZE / 2
          const px = RADIUS + Math.cos(angle) * OUTER_R - halfBtn
          const py = RADIUS + Math.sin(angle) * OUTER_R - halfBtn

          return (
            <button
              key={`${revealGen}-${preset.id}`}
              type="button"
              aria-label={`Place ${preset.label}`}
              onClick={() => handleSelect(preset)}
              className="absolute flex flex-col items-center justify-center rounded-full bg-navy border border-navy/40 text-parchment/80 hover:border-parchment-border hover:text-parchment"
              style={{
                left: px,
                top: py,
                width: SHAPE_SIZE,
                height: SHAPE_SIZE,
                opacity: shapesRevealed ? 1 : 0,
                transform: shapesRevealed ? 'scale(1)' : 'scale(0.3)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.45), 0 1px 4px rgba(0,0,0,0.3)',
                transition: `opacity 140ms cubic-bezier(.34,1.56,.64,1) ${i * 25}ms, transform 140ms cubic-bezier(.34,1.56,.64,1) ${i * 25}ms, border-color 150ms`,
              }}
            >
              <svg
                className="h-7 w-7"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={preset.iconPath} />
              </svg>
              <span className="text-[11px] mt-0.5 leading-tight whitespace-nowrap">{preset.label}</span>
            </button>
          )
        })
      })()}
    </div>
  )
}
