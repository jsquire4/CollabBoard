'use client'

import { useState, useRef, useEffect } from 'react'
import { useClickOutside } from '@/hooks/useClickOutside'

// Expanded palette: Theorem muted strategy palette (exported for context menu)
export const EXPANDED_PALETTE = [
  // Parchment/neutral tones (Theorem identity)
  '#FAF8F4', '#F0EBE3', '#E8E3DA', '#C49A6C',
  // Navy, brg, charcoal, slate
  '#1B3A6B', '#1E4330', '#1C1C1E', '#8896A5',
  // Muted accents
  '#7B6FD4', '#5B8DEF', '#D4854A', '#C9A84C',
  // Muted warm/semantic
  '#C85C5C', '#3D9E8C', '#C4907A', '#FFFFFF',
  // Neutrals
  '#374151', '#6B7280',
]

interface ColorPickerProps {
  selectedColor?: string
  onColorChange: (color: string) => void
  disabled?: boolean
  /** When true, renders as a compact button that opens a popover (for narrow sidebars) */
  compact?: boolean
  /** Optional label for the compact button tooltip */
  label?: string
}

export function ColorPicker({ selectedColor, onColorChange, disabled, compact, label = 'Color' }: ColorPickerProps) {
  const [showPopover, setShowPopover] = useState(false)
  const [customColor, setCustomColor] = useState(selectedColor || '#1B3A6B')
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

  const pickerContent = (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-medium text-charcoal/70 dark:text-parchment/60">Color</div>
      <div className="grid grid-cols-6 gap-1">
        {EXPANDED_PALETTE.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onColorChange(color)}
            disabled={disabled}
            className={`h-6 w-6 rounded-full transition hover:scale-110 disabled:opacity-50 disabled:hover:scale-100 ${
              color === '#FFFFFF' ? 'ring-1 ring-parchment-border' : ''
            } ${
              color === selectedColor ? 'ring-2 ring-charcoal ring-offset-2 dark:ring-offset-[#111827]' : ''
            }`}
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
      </div>
      <div className="space-y-1">
        <div className="text-xs font-medium text-charcoal/70 dark:text-parchment/60">Custom</div>
        <div className="flex gap-2">
          <input
            type="color"
            value={customColor}
            onChange={handleCustomChange}
            className="h-8 w-12 cursor-pointer rounded border bg-transparent p-0 border-parchment-border dark:border-white/10"
          />
          <input
            type="text"
            value={customColor}
            onChange={(e) => {
              const v = e.target.value
              setCustomColor(v)
              if (/^#[0-9A-Fa-f]{6}$/.test(v)) onColorChange(v)
            }}
            className="w-20 rounded border px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-navy border-parchment-border bg-parchment text-charcoal dark:border-white/10 dark:bg-[#1E293B] dark:text-parchment/80"
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
          className="flex h-9 w-9 flex-col items-center justify-center rounded-lg transition disabled:opacity-50 hover:bg-parchment-dark dark:hover:bg-white/10"
          title={label}
        >
          <span
            className="h-5 w-5 rounded border-2 border-parchment-border dark:border-white/10"
            style={{ backgroundColor: selectedColor || '#E8E3DA' }}
          />
        </button>
        {showPopover && popoverPos && (
          <div
            ref={popoverPanelRef}
            role="dialog"
            aria-label="Color picker"
            className="fixed z-[200] w-48 rounded-xl border p-3 shadow-lg ring-1 ring-black/10 dark:ring-white/10 border-parchment-border bg-parchment dark:border-white/10 dark:bg-[#1E293B]"
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
