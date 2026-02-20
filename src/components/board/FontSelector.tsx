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

const TEXT_COLOR_SWATCHES = [
  '#000000', '#1E293B', '#374151', '#FFFFFF',
  '#C85C5C', '#D4854A', '#C9A84C', '#3D9E8C',
  '#5B8DEF', '#7B6FD4', '#C4907A', '#8896A5',
]

interface FontSelectorProps {
  fontFamily?: string
  fontSize?: number
  fontStyle?: FontStyle
  textAlign?: string
  textVerticalAlign?: string
  textColor?: string
  showTextLayout?: boolean
  onFontChange: (updates: { font_family?: string; font_size?: number; font_style?: FontStyle }) => void
  onTextStyleChange?: (updates: { text_align?: string; text_vertical_align?: string; text_color?: string }) => void
  disabled?: boolean
  compact?: boolean
  dark?: boolean
}

export function FontSelector({
  fontFamily = 'sans-serif',
  fontSize = 14,
  fontStyle = 'normal',
  textAlign = 'center',
  textVerticalAlign = 'middle',
  textColor = '#000000',
  showTextLayout = false,
  onFontChange,
  onTextStyleChange,
  disabled,
  compact,
  dark = false,
}: FontSelectorProps) {
  const [showPopover, setShowPopover] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const popoverPanelRef = useRef<HTMLDivElement>(null)
  const textColorPickerRef = useRef<HTMLInputElement>(null)
  const compactButtonRef = useRef<HTMLButtonElement>(null)
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null)

  useClickOutside([popoverRef, popoverPanelRef], showPopover, () => setShowPopover(false))

  const labelCls = `text-xs font-medium text-charcoal/70 dark:text-parchment/60`
  const btnCls = (active: boolean) =>
    `rounded px-2 py-1 text-xs font-medium transition disabled:opacity-50 ${
      active
        ? 'bg-navy/10 text-navy'
        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-[#1E293B] dark:text-parchment/60 dark:hover:bg-white/15'
    }`

  const content = (
    <div className="w-56 space-y-3 p-3">
      <div>
        <div className={`mb-1 ${labelCls}`}>Font</div>
        <select
          value={fontFamily}
          onChange={(e) => onFontChange({ font_family: e.target.value })}
          disabled={disabled}
          className="w-full rounded border px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-navy disabled:opacity-50 border-parchment-border bg-parchment text-charcoal dark:border-white/10 dark:bg-[#1E293B] dark:text-parchment/80"
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <div className={`mb-1 ${labelCls}`}>Size</div>
        <div className="flex flex-wrap gap-1">
          {FONT_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => onFontChange({ font_size: size })}
              disabled={disabled}
              className={btnCls(fontSize === size)}
            >
              {size}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className={`mb-1 ${labelCls}`}>Style</div>
        <div className="flex flex-wrap gap-1">
          {FONT_STYLES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => onFontChange({ font_style: value })}
              disabled={disabled}
              className={btnCls(fontStyle === value)}
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

      {/* Text layout controls */}
      {showTextLayout && onTextStyleChange && (
        <>
          <div>
            <div className={`mb-1 ${labelCls}`}>Align</div>
            <div className="flex gap-1">
              {(['left', 'center', 'right'] as const).map((align) => (
                <button
                  key={align}
                  type="button"
                  onClick={() => onTextStyleChange({ text_align: align })}
                  disabled={disabled}
                  className={`flex-1 ${btnCls(textAlign === align)}`}
                >
                  {align.charAt(0).toUpperCase() + align.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className={`mb-1 ${labelCls}`}>Vertical</div>
            <div className="flex gap-1">
              {(['top', 'middle', 'bottom'] as const).map((valign) => (
                <button
                  key={valign}
                  type="button"
                  onClick={() => onTextStyleChange({ text_vertical_align: valign })}
                  disabled={disabled}
                  className={`flex-1 ${btnCls(textVerticalAlign === valign)}`}
                >
                  {valign.charAt(0).toUpperCase() + valign.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className={`mb-1 ${labelCls}`}>Text Color</div>
            <div className="flex flex-wrap gap-1">
              {TEXT_COLOR_SWATCHES.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => onTextStyleChange({ text_color: color })}
                  disabled={disabled}
                  className={`h-5 w-5 rounded-full transition hover:scale-110 disabled:opacity-50 ${
                    color === '#FFFFFF' ? 'border border-parchment-border dark:border-white/10' : ''
                  } ${
                    color === textColor ? 'ring-2 ring-slate-700 ring-offset-1 dark:ring-offset-[#111827]' : ''
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
              {/* Custom color picker */}
              <button
                type="button"
                onClick={() => textColorPickerRef.current?.click()}
                disabled={disabled}
                className="h-5 w-5 rounded-full border border-dashed flex items-center justify-center hover:scale-110 transition disabled:opacity-50 border-parchment-border bg-parchment dark:border-white/10 dark:bg-[#1E293B]"
                title="Custom color"
              >
                <svg className="h-2.5 w-2.5 text-charcoal/70 dark:text-parchment/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
                </svg>
              </button>
              <input
                ref={textColorPickerRef}
                type="color"
                value={textColor}
                onChange={(e) => onTextStyleChange?.({ text_color: e.target.value })}
                className="sr-only"
                tabIndex={-1}
              />
            </div>
          </div>
        </>
      )}
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
          aria-label="Font options"
          aria-expanded={showPopover}
          aria-haspopup="dialog"
          className="flex h-9 w-9 flex-col items-center justify-center rounded-lg transition disabled:opacity-50 hover:bg-parchment-dark dark:hover:bg-white/10"
          title="Font options"
        >
          <svg className="h-5 w-5 text-charcoal/70 dark:text-parchment/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
          </svg>
        </button>
        {showPopover && popoverPos && (
          <div
            ref={popoverPanelRef}
            role="dialog"
            aria-label="Font options"
            className="fixed z-[200] rounded-xl border shadow-lg ring-1 ring-black/10 dark:ring-white/10 border-parchment-border bg-parchment dark:border-white/10 dark:bg-[#1E293B]"
            style={{ top: popoverPos.top, left: popoverPos.left }}
            onMouseDown={e => e.preventDefault()}
          >
            {content}
          </div>
        )}
      </div>
    )
  }

  return <div className="rounded-xl border p-3 shadow-lg border-parchment-border bg-parchment dark:border-white/10 dark:bg-[#1E293B]">{content}</div>
}
