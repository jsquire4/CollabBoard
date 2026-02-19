'use client'

import { useState, useRef, useEffect } from 'react'
import { useClickOutside } from '@/hooks/useClickOutside'

// Expanded palette: base 6 + additional warm, cool, neutrals (exported for context menu)
export const EXPANDED_PALETTE = [
  '#FFEB3B', '#FF9800', '#E91E63', '#9C27B0', '#2196F3', '#4CAF50',
  '#F44336', '#FF5722', '#795548', '#607D8B', '#00BCD4', '#8BC34A',
  '#FFC107', '#673AB7', '#3F51B5', '#009688', '#CDDC39', '#9E9E9E',
]

interface ColorPickerProps {
  selectedColor?: string
  onColorChange: (color: string) => void
  disabled?: boolean
  /** When true, renders as a compact button that opens a popover (for narrow sidebars) */
  compact?: boolean
  /** Optional label for the compact button tooltip */
  label?: string
  dark?: boolean
}

export function ColorPicker({ selectedColor, onColorChange, disabled, compact, label = 'Color', dark = false }: ColorPickerProps) {
  const [showPopover, setShowPopover] = useState(false)
  const [customColor, setCustomColor] = useState(selectedColor || '#6366f1')
  const popoverRef = useRef<HTMLDivElement>(null)
  const popoverPanelRef = useRef<HTMLDivElement>(null)
  const compactButtonRef = useRef<HTMLButtonElement>(null)
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (selectedColor && !EXPANDED_PALETTE.includes(selectedColor)) {
      setCustomColor(selectedColor)
    }
  }, [selectedColor])

  useClickOutside([popoverRef, popoverPanelRef], showPopover, () => setShowPopover(false))

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value
    setCustomColor(color)
    onColorChange(color)
  }

  const dk = dark

  const pickerContent = (
    <div className="flex flex-col gap-2">
      <div className={`text-xs font-medium ${dk ? 'text-slate-400' : 'text-slate-500'}`}>Color</div>
      <div className="grid grid-cols-6 gap-1">
        {EXPANDED_PALETTE.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onColorChange(color)}
            disabled={disabled}
            className={`h-6 w-6 rounded-full transition hover:scale-110 disabled:opacity-50 disabled:hover:scale-100 ${
              color === selectedColor ? `ring-2 ring-slate-700 ${dk ? 'ring-offset-slate-900' : ''} ring-offset-2` : ''
            }`}
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
      </div>
      <div className="space-y-1">
        <div className={`text-xs font-medium ${dk ? 'text-slate-400' : 'text-slate-500'}`}>Custom</div>
        <div className="flex gap-2">
          <input
            type="color"
            value={customColor}
            onChange={handleCustomChange}
            className={`h-8 w-12 cursor-pointer rounded border bg-transparent p-0 ${dk ? 'border-slate-600' : 'border-slate-300'}`}
          />
          <input
            type="text"
            value={customColor}
            onChange={(e) => {
              const v = e.target.value
              setCustomColor(v)
              if (/^#[0-9A-Fa-f]{6}$/.test(v)) onColorChange(v)
            }}
            className={`w-20 rounded border px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-indigo-500 ${
              dk ? 'border-slate-600 bg-slate-800 text-slate-300' : 'border-slate-300 bg-white text-slate-900'
            }`}
            placeholder="#000000"
          />
        </div>
      </div>
    </div>
  )

  if (compact) {
    const handleToggle = () => {
      if (!showPopover && compactButtonRef.current) {
        const rect = compactButtonRef.current.getBoundingClientRect()
        setPopoverPos({ top: rect.top, left: rect.right + 8 })
      }
      setShowPopover(!showPopover)
    }

    return (
      <div ref={popoverRef}>
        <button
          ref={compactButtonRef}
          type="button"
          onClick={handleToggle}
          disabled={disabled}
          aria-label={label}
          aria-expanded={showPopover}
          aria-haspopup="dialog"
          className={`flex h-9 w-9 flex-col items-center justify-center rounded-lg transition disabled:opacity-50 ${dk ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}
          title={label}
        >
          <span
            className={`h-5 w-5 rounded border-2 ${dk ? 'border-slate-600' : 'border-slate-300'}`}
            style={{ backgroundColor: selectedColor || '#94a3b8' }}
          />
        </button>
        {showPopover && popoverPos && (
          <div
            ref={popoverPanelRef}
            role="dialog"
            aria-label="Color picker"
            className={`fixed z-[200] w-48 rounded-xl border p-3 shadow-xl ${dk ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}
            style={{ top: popoverPos.top, left: popoverPos.left }}
          >
            {pickerContent}
          </div>
        )}
      </div>
    )
  }

  return pickerContent
}
