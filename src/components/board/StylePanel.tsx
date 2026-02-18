'use client'

import { useState, useRef } from 'react'
import { useClickOutside } from '@/hooks/useClickOutside'

const STROKE_COLOR_SWATCHES = [
  '#000000', '#374151', '#6B7280', '#EF4444', '#F97316', '#EAB308',
  '#22C55E', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6', '#FFFFFF',
]

const STROKE_PRESETS = [
  { width: 1, label: '1' },
  { width: 2, label: '2' },
  { width: 3, label: '3' },
  { width: 4, label: '4' },
  { width: 6, label: '6' },
  { width: 8, label: '8' },
]

const DASH_PRESETS: { dash?: string; label: string }[] = [
  { dash: undefined, label: 'Solid' },
  { dash: '[8,4]', label: 'Dashed' },
  { dash: '[2,2]', label: 'Dotted' },
]

const OPACITY_PRESETS = [
  { value: 0.25, label: '25%' },
  { value: 0.5, label: '50%' },
  { value: 0.75, label: '75%' },
  { value: 1, label: '100%' },
]

interface StylePanelProps {
  strokeColor?: string | null
  strokeWidth?: number
  strokeDash?: string
  opacity?: number
  shadowBlur?: number
  cornerRadius?: number
  showCornerRadius?: boolean
  onStrokeStyleChange: (updates: { stroke_color?: string | null; stroke_width?: number; stroke_dash?: string }) => void
  onOpacityChange: (opacity: number) => void
  onShadowChange: (updates: { shadow_blur?: number; shadow_color?: string; shadow_offset_x?: number; shadow_offset_y?: number }) => void
  onCornerRadiusChange?: (corner_radius: number) => void
  compact?: boolean
}

export function StylePanel({
  strokeColor,
  strokeWidth = 2,
  strokeDash,
  opacity = 1,
  shadowBlur = 6,
  cornerRadius = 0,
  showCornerRadius = false,
  onStrokeStyleChange,
  onOpacityChange,
  onShadowChange,
  onCornerRadiusChange,
  compact,
}: StylePanelProps) {
  const [showPopover, setShowPopover] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  useClickOutside(popoverRef, showPopover, () => setShowPopover(false))

  const content = (
    <div className="w-56 space-y-3 p-3">
      {/* Outline section */}
      <div>
        <div className="mb-1 text-xs font-medium text-slate-500">Outline</div>
        <div className="flex flex-wrap gap-1 mb-2">
          <button
            type="button"
            onClick={() => onStrokeStyleChange({ stroke_color: null })}
            className={`h-6 w-6 rounded-full border-2 border-slate-300 transition hover:scale-110 flex items-center justify-center ${
              !strokeColor ? 'ring-2 ring-slate-700 ring-offset-1' : ''
            }`}
            title="No outline"
          >
            <span className="text-xs text-red-400 font-bold">/</span>
          </button>
          {STROKE_COLOR_SWATCHES.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onStrokeStyleChange({ stroke_color: color })}
              className={`h-6 w-6 rounded-full transition hover:scale-110 ${
                color === '#FFFFFF' ? 'border border-slate-300' : ''
              } ${
                color === strokeColor ? 'ring-2 ring-slate-700 ring-offset-1' : ''
              }`}
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
        {strokeColor && (
          <>
            <div className="mb-1 text-xs text-slate-400">Weight</div>
            <div className="flex flex-wrap gap-1 mb-2">
              {STROKE_PRESETS.map((p) => (
                <button
                  key={p.width}
                  type="button"
                  onClick={() => onStrokeStyleChange({ stroke_width: p.width })}
                  className={`rounded px-2 py-0.5 text-xs font-medium transition ${
                    strokeWidth === p.width
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="mb-1 text-xs text-slate-400">Style</div>
            <div className="flex flex-wrap gap-1">
              {DASH_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => onStrokeStyleChange({ stroke_dash: p.dash })}
                  className={`rounded px-2 py-0.5 text-xs font-medium transition ${
                    strokeDash === p.dash
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Shadow section */}
      <div>
        <div className="mb-1 text-xs font-medium text-slate-500">Shadow</div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min="0"
            max="20"
            step="1"
            value={shadowBlur}
            onChange={(e) => onShadowChange({ shadow_blur: Number(e.target.value) })}
            className="h-1 w-full cursor-pointer appearance-none rounded bg-slate-200 accent-indigo-600"
          />
          <span className="min-w-[24px] text-right text-xs text-slate-500">{shadowBlur}</span>
        </div>
      </div>

      {/* Opacity section */}
      <div>
        <div className="mb-1 text-xs font-medium text-slate-500">Opacity</div>
        <div className="flex items-center gap-2 mb-1">
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={opacity}
            onChange={(e) => onOpacityChange(Number(e.target.value))}
            className="h-1 w-full cursor-pointer appearance-none rounded bg-slate-200 accent-indigo-600"
          />
          <span className="min-w-[32px] text-right text-xs text-slate-500">{Math.round(opacity * 100)}%</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {OPACITY_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => onOpacityChange(p.value)}
              className={`rounded px-2 py-0.5 text-xs font-medium transition ${
                Math.abs(opacity - p.value) < 0.01
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Corner radius section */}
      {showCornerRadius && onCornerRadiusChange && (
        <div>
          <div className="mb-1 text-xs font-medium text-slate-500">Corner Radius</div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="50"
              step="1"
              value={cornerRadius}
              onChange={(e) => onCornerRadiusChange(Number(e.target.value))}
              className="h-1 w-full cursor-pointer appearance-none rounded bg-slate-200 accent-indigo-600"
            />
            <span className="min-w-[24px] text-right text-xs text-slate-500">{cornerRadius}</span>
          </div>
        </div>
      )}
    </div>
  )

  if (compact) {
    return (
      <div className="relative" ref={popoverRef}>
        <button
          type="button"
          onClick={() => setShowPopover(!showPopover)}
          aria-label="Style options"
          aria-expanded={showPopover}
          aria-haspopup="dialog"
          className="flex h-10 w-10 flex-col items-center justify-center rounded-lg transition hover:bg-slate-100"
          title="Style"
        >
          <svg className="h-5 w-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
        </button>
        {showPopover && (
          <div
            role="dialog"
            aria-label="Style options"
            className="absolute left-full top-0 z-50 ml-2 rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            {content}
          </div>
        )}
      </div>
    )
  }

  return <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg">{content}</div>
}
