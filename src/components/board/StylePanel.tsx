'use client'

import { useState, useRef, useEffect } from 'react'
import { useClickOutside } from '@/hooks/useClickOutside'
import { STROKE_PRESETS, STROKE_COLOR_SWATCHES } from './styleConstants'

const DASH_PRESETS = [
  { dash: '[]', label: 'Solid' },
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
  const btnRef = useRef<HTMLButtonElement>(null)
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  useClickOutside([popoverRef, btnRef], showPopover && !!compact, () => setShowPopover(false))

  useEffect(() => {
    if (!compact || !showPopover || !btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const top = rect.top
    const left = rect.right + 8
    setPopoverPos({ top, left })
    const rafId = requestAnimationFrame(() => {
      const panel = popoverRef.current
      if (!panel) return
      const panelRect = panel.getBoundingClientRect()
      if (panelRect.bottom > window.innerHeight - 8) {
        setPopoverPos({ top: Math.max(8, window.innerHeight - panelRect.height - 8), left })
      }
    })
    return () => cancelAnimationFrame(rafId)
  }, [compact, showPopover])

  const sectionLabel = `mb-1 text-xs font-medium text-charcoal/70 dark:text-parchment/60`
  const subLabel = `mb-1 text-xs text-charcoal/70 dark:text-parchment/60`
  const valueLabelSm = `text-right text-xs text-charcoal/70 dark:text-parchment/60`
  const rangeTrack = `h-1 w-full cursor-pointer appearance-none rounded accent-navy bg-parchment-dark dark:bg-white/10`
  const presetActive = 'bg-navy/10 text-navy'
  const presetInactive = `bg-parchment-dark text-charcoal hover:bg-parchment-dark dark:bg-[#1E293B] dark:text-parchment/80 dark:hover:bg-white/15`

  const content = (
    <div className="w-56 space-y-3 p-3">
      {/* Outline section */}
      <div>
        <div className={sectionLabel}>Outline</div>
        <div className="flex flex-wrap gap-1 mb-2">
          <button
            type="button"
            onClick={() => onStrokeStyleChange({ stroke_color: null })}
            className={`h-6 w-6 rounded-full border-2 transition hover:scale-110 flex items-center justify-center border-parchment-border dark:border-white/10 ${!strokeColor ? 'ring-2 ring-charcoal ring-offset-1 dark:ring-offset-[#111827]' : ''}`}
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
                color === '#FFFFFF' ? 'border border-parchment-border dark:border-white/10' : ''
              } ${
                color === strokeColor
                  ? 'ring-2 ring-charcoal ring-offset-1 dark:ring-offset-[#111827]'
                  : ''
              }`}
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
        {strokeColor && (
          <>
            <div className={subLabel}>Weight</div>
            <div className="flex flex-wrap gap-1 mb-2">
              {STROKE_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => onStrokeStyleChange({ stroke_width: p.stroke_width })}
                  className={`rounded px-2 py-0.5 text-xs font-medium transition ${
                    strokeWidth === p.stroke_width ? presetActive : presetInactive
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className={subLabel}>Style</div>
            <div className="flex flex-wrap gap-1">
              {DASH_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => onStrokeStyleChange({ stroke_dash: p.dash })}
                  className={`rounded px-2 py-0.5 text-xs font-medium transition ${
                    (strokeDash ?? '[]') === p.dash ? presetActive : presetInactive
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
        <div className={sectionLabel}>Shadow</div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min="0"
            max="20"
            step="1"
            value={shadowBlur}
            onChange={(e) => onShadowChange({ shadow_blur: Number(e.target.value) })}
            className={rangeTrack}
          />
          <span className={`min-w-[24px] ${valueLabelSm}`}>{shadowBlur}</span>
        </div>
      </div>

      {/* Opacity section */}
      <div>
        <div className={sectionLabel}>Opacity</div>
        <div className="flex items-center gap-2 mb-1">
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={opacity}
            onChange={(e) => onOpacityChange(Number(e.target.value))}
            className={rangeTrack}
          />
          <span className={`min-w-[32px] ${valueLabelSm}`}>{Math.round(opacity * 100)}%</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {OPACITY_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => onOpacityChange(p.value)}
              className={`rounded px-2 py-0.5 text-xs font-medium transition ${
                Math.abs(opacity - p.value) < 0.01 ? presetActive : presetInactive
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
          <div className={sectionLabel}>Corner Radius</div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="50"
              step="1"
              value={cornerRadius}
              onChange={(e) => onCornerRadiusChange(Number(e.target.value))}
              className={rangeTrack}
            />
            <span className={`min-w-[24px] ${valueLabelSm}`}>{cornerRadius}</span>
          </div>
        </div>
      )}
    </div>
  )

  if (compact) {
    return (
      <div>
        <button
          ref={btnRef}
          type="button"
          onClick={() => setShowPopover(prev => !prev)}
          aria-label="Style options"
          aria-expanded={showPopover}
          aria-haspopup="dialog"
          className="flex h-10 w-10 flex-col items-center justify-center rounded-lg transition hover:bg-parchment-dark dark:hover:bg-white/10"
          title="Style"
        >
          <svg className="h-5 w-5 text-charcoal/70 dark:text-parchment/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
        </button>
        {showPopover && (
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Style options"
            className="fixed z-[200] rounded-xl border shadow-lg ring-1 ring-black/10 dark:ring-white/10 border-parchment-border bg-parchment dark:border-white/10 dark:bg-[#1E293B]"
            style={{ top: popoverPos.top, left: popoverPos.left }}
          >
            {content}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-xl border p-3 shadow-lg border-parchment-border bg-parchment dark:border-white/10 dark:bg-[#1E293B]">
      {content}
    </div>
  )
}
