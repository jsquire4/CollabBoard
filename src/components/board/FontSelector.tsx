'use client'

import { useState, useRef } from 'react'
import type { FontStyle } from '@/types/board'
import { useClickOutside } from '@/hooks/useClickOutside'

const FONT_FAMILIES = [
  { value: 'sans-serif', label: 'Sans' },
  { value: 'serif', label: 'Serif' },
  { value: 'monospace', label: 'Mono' },
  { value: 'cursive', label: 'Cursive' },
]

const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32]

const FONT_STYLES: { value: FontStyle; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'bold', label: 'Bold' },
  { value: 'italic', label: 'Italic' },
  { value: 'bold italic', label: 'Bold Italic' },
]

interface FontSelectorProps {
  fontFamily?: string
  fontSize?: number
  fontStyle?: FontStyle
  onFontChange: (updates: { font_family?: string; font_size?: number; font_style?: FontStyle }) => void
  disabled?: boolean
  compact?: boolean
}

export function FontSelector({
  fontFamily = 'sans-serif',
  fontSize = 14,
  fontStyle = 'normal',
  onFontChange,
  disabled,
  compact,
}: FontSelectorProps) {
  const [showPopover, setShowPopover] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  useClickOutside(popoverRef, showPopover, () => setShowPopover(false))

  const content = (
    <div className="w-56 space-y-3 p-3">
      <div>
        <div className="mb-1 text-xs font-medium text-slate-500">Font</div>
        <select
          value={fontFamily}
          onChange={(e) => onFontChange({ font_family: e.target.value })}
          disabled={disabled}
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <div className="mb-1 text-xs font-medium text-slate-500">Size</div>
        <div className="flex flex-wrap gap-1">
          {FONT_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => onFontChange({ font_size: size })}
              disabled={disabled}
              className={`rounded px-2 py-1 text-xs font-medium transition disabled:opacity-50 ${
                fontSize === size
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1 text-xs font-medium text-slate-500">Style</div>
        <div className="flex flex-wrap gap-1">
          {FONT_STYLES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => onFontChange({ font_style: value })}
              disabled={disabled}
              className={`rounded px-2 py-1 text-xs font-medium transition disabled:opacity-50 ${
                fontStyle === value
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
              style={
                value === 'bold'
                  ? { fontWeight: 'bold' }
                  : value === 'italic'
                    ? { fontStyle: 'italic' }
                    : value === 'bold italic'
                      ? { fontWeight: 'bold', fontStyle: 'italic' }
                      : undefined
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  if (compact) {
    return (
      <div className="relative" ref={popoverRef}>
        <button
          type="button"
          onClick={() => setShowPopover(!showPopover)}
          disabled={disabled}
          aria-label="Font options"
          aria-expanded={showPopover}
          aria-haspopup="dialog"
          className="flex h-10 w-10 flex-col items-center justify-center rounded-lg transition hover:bg-slate-100 disabled:opacity-50"
          title="Font options"
        >
          <svg className="h-5 w-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
          </svg>
        </button>
        {showPopover && (
          <div
            role="dialog"
            aria-label="Font options"
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
