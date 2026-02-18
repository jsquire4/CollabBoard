'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { BoardRole } from '@/types/sharing'
import { ColorPicker } from './ColorPicker'
import { FontSelector } from './FontSelector'
import type { BoardObjectType, FontStyle } from '@/types/board'
import type { ShapePreset } from './shapePresets'
import {
  STANDALONE_PRESETS,
  SHAPE_GROUPS,
  FRAME_PRESET,
  LINE_PRESETS,
} from './shapePresets'
import { useClickOutside } from '@/hooks/useClickOutside'
import { EXPANDED_PALETTE } from './ColorPicker'

interface LeftToolbarProps {
  userRole: BoardRole
  activeTool: BoardObjectType | null
  hasSelection: boolean
  isEditingText: boolean
  selectedColor?: string
  selectedFontFamily?: string
  selectedFontSize?: number
  selectedFontStyle?: FontStyle
  selectedTextAlign?: string
  selectedTextVerticalAlign?: string
  selectedTextColor?: string
  onColorChange: (color: string) => void
  onFontChange: (updates: { font_family?: string; font_size?: number; font_style?: FontStyle }) => void
  onTextStyleChange: (updates: { text_align?: string; text_vertical_align?: string; text_color?: string }) => void
  onDelete: () => void
  onDuplicate: () => void
  onGroup: () => void
  onUngroup: () => void
  canGroup: boolean
  canUngroup: boolean
  selectedStrokeColor?: string | null
  onStrokeColorChange: (color: string | null) => void
  anySelectedLocked?: boolean
  activePreset: ShapePreset | null
  onPresetSelect: (preset: ShapePreset) => void
}

export function LeftToolbar({
  userRole,
  activeTool,
  hasSelection,
  isEditingText,
  selectedColor,
  selectedFontFamily,
  selectedFontSize,
  selectedFontStyle,
  selectedTextAlign,
  selectedTextVerticalAlign,
  selectedTextColor,
  onColorChange,
  onFontChange,
  onTextStyleChange,
  onDelete,
  onDuplicate,
  onGroup,
  onUngroup,
  canGroup,
  canUngroup,
  selectedStrokeColor,
  onStrokeColorChange,
  anySelectedLocked,
  activePreset,
  onPresetSelect,
}: LeftToolbarProps) {
  const canEdit = userRole !== 'viewer'
  const [openGroupId, setOpenGroupId] = useState<string | null>(null)
  const [ngonSides, setNgonSides] = useState(5)

  const closeFlyout = useCallback(() => setOpenGroupId(null), [])

  return (
    <aside className="flex w-16 shrink-0 flex-col items-center gap-0.5 border-r border-slate-200 bg-white py-2 overflow-y-auto">
      {canEdit && (
        <>
          {isEditingText ? (
            <div onMouseDown={e => e.preventDefault()}>
              <div className="mb-1 w-full px-1.5">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 text-center">
                  Text
                </div>
              </div>
              <FontSelector
                fontFamily={selectedFontFamily}
                fontSize={selectedFontSize}
                fontStyle={selectedFontStyle}
                textAlign={selectedTextAlign}
                textVerticalAlign={selectedTextVerticalAlign}
                textColor={selectedTextColor}
                showTextLayout={true}
                onFontChange={onFontChange}
                onTextStyleChange={onTextStyleChange}
                compact
              />
            </div>
          ) : (
            <>
              {/* ── Essentials: Sticky Note + Frame ── */}
              <SectionLabel text="Basics" />
              {STANDALONE_PRESETS.filter(p => p.id === 'sticky_note' || p.id === 'text_box').map(preset => (
                <PresetButton
                  key={preset.id}
                  preset={preset}
                  isActive={activePreset?.id === preset.id || (!activePreset && activeTool === preset.dbType)}
                  onSelect={onPresetSelect}
                />
              ))}
              <PresetButton
                preset={FRAME_PRESET}
                isActive={activePreset?.id === 'frame' || (!activePreset && activeTool === 'frame')}
                onSelect={onPresetSelect}
              />
              <PlaceholderButton label="Connector" iconPath="M4 20h2a4 4 0 0 0 4-4v-8a4 4 0 0 1 4-4h2 M18 4l2 4-2 4" />
              <PlaceholderButton label="Web Frame" iconPath="M3 3h18v18H3z M3 9h18 M9 9v12" />
              <PlaceholderButton label="File" iconPath="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 13h6 M9 17h4" />

              <Divider />

              {/* ── Lines ── */}
              <SectionLabel text="Lines" />
              {LINE_PRESETS.map(preset => (
                <PresetButton
                  key={preset.id}
                  preset={preset}
                  isActive={activePreset?.id === preset.id || (!activePreset && activeTool === preset.dbType)}
                  onSelect={onPresetSelect}
                />
              ))}

              <Divider />

              {/* ── Shapes: circle, polygon groups, N-gon ── */}
              <SectionLabel text="Shapes" />
              {STANDALONE_PRESETS.filter(p => p.id === 'circle').map(preset => (
                <PresetButton
                  key={preset.id}
                  preset={preset}
                  isActive={activePreset?.id === preset.id || (!activePreset && activeTool === preset.dbType)}
                  onSelect={onPresetSelect}
                />
              ))}
              {SHAPE_GROUPS.filter(g => g.id === 'triangles' || g.id === 'quads').map(group => (
                <ShapeGroupButton
                  key={group.id}
                  group={group}
                  isOpen={openGroupId === group.id}
                  activePreset={activePreset}
                  onToggle={() => setOpenGroupId(prev => prev === group.id ? null : group.id)}
                  onPresetSelect={(p) => { onPresetSelect(p); closeFlyout() }}
                  onClose={closeFlyout}
                />
              ))}
              <NgonGroupButton
                isOpen={openGroupId === 'ngon'}
                activePreset={activePreset}
                sides={ngonSides}
                onSidesChange={setNgonSides}
                onToggle={() => setOpenGroupId(prev => prev === 'ngon' ? null : 'ngon')}
                onPresetSelect={(p) => { onPresetSelect(p); closeFlyout() }}
                onClose={closeFlyout}
              />

              <Divider />

              {/* ── Symbols: stars/shapes + flowchart ── */}
              <SectionLabel text="Symbols" />
              {SHAPE_GROUPS.filter(g => g.id === 'symbols' || g.id === 'flowchart').map(group => (
                <ShapeGroupButton
                  key={group.id}
                  group={group}
                  isOpen={openGroupId === group.id}
                  activePreset={activePreset}
                  onToggle={() => setOpenGroupId(prev => prev === group.id ? null : group.id)}
                  onPresetSelect={(p) => { onPresetSelect(p); closeFlyout() }}
                  onClose={closeFlyout}
                />
              ))}
            </>
          )}

          {/* ── Selection tools ── */}
          {hasSelection && (
            <div className={anySelectedLocked ? 'opacity-50 pointer-events-none' : ''}>
              <Divider />
              <ColorPicker
                selectedColor={selectedColor}
                onColorChange={onColorChange}
                compact
                label="Fill"
              />
              <BorderColorButton
                currentColor={selectedStrokeColor}
                onColorChange={onStrokeColorChange}
              />
              <Divider />
              <button
                type="button"
                onClick={onDuplicate}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100"
                title="Duplicate (Ctrl+D)"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
              {canGroup && (
                <button
                  type="button"
                  onClick={onGroup}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100"
                  title="Group (Ctrl+G)"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h3l2 2h5a2 2 0 012 2v7a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
                  </svg>
                </button>
              )}
              {canUngroup && (
                <button
                  type="button"
                  onClick={onUngroup}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100"
                  title="Ungroup (Ctrl+Shift+G)"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h3l2 2h5a2 2 0 012 2v7a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                onClick={onDelete}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-red-500 transition hover:bg-red-50"
                title="Delete (Del)"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          )}
        </>
      )}
    </aside>
  )
}

/* ── Shared small components ── */

function SectionLabel({ text }: { text: string }) {
  return (
    <div className="mb-1 w-full px-1.5">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 text-center">
        {text}
      </div>
    </div>
  )
}

function Divider() {
  return <div className="my-1 h-px w-8 bg-slate-200" />
}

/** SVG icon rendered from a path string in a 24×24 viewBox */
function PresetIcon({ iconPath, className = 'h-4.5 w-4.5' }: { iconPath: string; className?: string }) {
  return (
    <svg className={`${className} text-slate-900`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={iconPath} />
    </svg>
  )
}

/* ── Single preset button ── */

function PresetButton({ preset, isActive, onSelect }: {
  preset: ShapePreset
  isActive: boolean
  onSelect: (p: ShapePreset) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(preset)}
      className={`flex h-9 w-9 flex-col items-center justify-center rounded-lg transition ${
        isActive ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
      }`}
      title={preset.label}
    >
      <PresetIcon iconPath={preset.iconPath} />
    </button>
  )
}

/* ── Placeholder button for upcoming features ── */

function PlaceholderButton({ label, iconPath }: { label: string; iconPath: string }) {
  return (
    <button
      type="button"
      disabled
      className="flex h-9 w-9 flex-col items-center justify-center rounded-lg text-slate-300 cursor-not-allowed"
      title={`${label} (coming soon)`}
    >
      <PresetIcon iconPath={iconPath} />
    </button>
  )
}

/* ── Shape group button with flyout ── */

function ShapeGroupButton({ group, isOpen, activePreset, onToggle, onPresetSelect, onClose }: {
  group: { id: string; label: string; iconPath: string; presets: ShapePreset[] }
  isOpen: boolean
  activePreset: ShapePreset | null
  onToggle: () => void
  onPresetSelect: (p: ShapePreset) => void
  onClose: () => void
}) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  useClickOutside([containerRef, panelRef], isOpen, onClose)

  const hasActiveChild = group.presets.some(p => p.id === activePreset?.id)

  useEffect(() => {
    if (!isOpen || !btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const top = rect.top
    const left = rect.right + 8
    setPos({ top, left })
    // After render, check if flyout overflows viewport and adjust
    const rafId = requestAnimationFrame(() => {
      const panel = panelRef.current
      if (!panel) return
      const panelRect = panel.getBoundingClientRect()
      let adjustedTop = top
      if (panelRect.bottom > window.innerHeight - 8) {
        adjustedTop = Math.max(8, window.innerHeight - panelRect.height - 8)
      }
      if (adjustedTop !== top) setPos({ top: adjustedTop, left })
    })
    return () => cancelAnimationFrame(rafId)
  }, [isOpen])

  return (
    <div ref={containerRef}>
      <button
        ref={btnRef}
        type="button"
        onClick={onToggle}
        className={`relative flex h-9 w-9 flex-col items-center justify-center rounded-lg transition ${
          hasActiveChild || isOpen ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
        }`}
        title={group.label}
      >
        <PresetIcon iconPath={group.iconPath} />
        {/* Flyout indicator triangle */}
        <span className="absolute right-0.5 bottom-0.5 text-[7px] leading-none text-slate-400">&#9656;</span>
      </button>
      {isOpen && (
        <div
          ref={panelRef}
          className="fixed z-[200] rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 px-1">
            {group.label}
          </div>
          <div className="grid grid-cols-3 gap-1" style={{ minWidth: '120px' }}>
            {group.presets.map(preset => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onPresetSelect(preset)}
                className={`flex flex-col items-center justify-center rounded-lg p-1.5 transition ${
                  activePreset?.id === preset.id ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
                }`}
                title={preset.label}
              >
                <PresetIcon iconPath={preset.iconPath} className="h-5 w-5" />
                <span className="text-[8px] mt-0.5 leading-tight truncate w-full text-center">{preset.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── N-gon group with slider ── */

function NgonGroupButton({ isOpen, activePreset, sides, onSidesChange, onToggle, onPresetSelect, onClose }: {
  isOpen: boolean
  activePreset: ShapePreset | null
  sides: number
  onSidesChange: (s: number) => void
  onToggle: () => void
  onPresetSelect: (p: ShapePreset) => void
  onClose: () => void
}) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  useClickOutside([containerRef, panelRef], isOpen, onClose)

  const isNgonActive = activePreset?.id.startsWith('ngon_')

  useEffect(() => {
    if (!isOpen || !btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const top = rect.top
    const left = rect.right + 8
    setPos({ top, left })
    const rafId = requestAnimationFrame(() => {
      const panel = panelRef.current
      if (!panel) return
      const panelRect = panel.getBoundingClientRect()
      let adjustedTop = top
      if (panelRect.bottom > window.innerHeight - 8) {
        adjustedTop = Math.max(8, window.innerHeight - panelRect.height - 8)
      }
      if (adjustedTop !== top) setPos({ top: adjustedTop, left })
    })
    return () => cancelAnimationFrame(rafId)
  }, [isOpen])

  const handleCreate = useCallback(() => {
    const preset: ShapePreset = {
      id: `ngon_${sides}`,
      label: `${sides}-gon`,
      dbType: 'ngon',
      defaultWidth: 120,
      defaultHeight: 120,
      overrides: { sides, color: '#F97316' },
      iconPath: 'M12 2L22.5 9.6 18.5 21.4H5.5L1.5 9.6Z',
    }
    onPresetSelect(preset)
  }, [sides, onPresetSelect])

  return (
    <div ref={containerRef}>
      <button
        ref={btnRef}
        type="button"
        onClick={onToggle}
        className={`relative flex h-9 w-9 flex-col items-center justify-center rounded-lg transition ${
          isNgonActive || isOpen ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
        }`}
        title="N-gon"
      >
        {/* Heptagon icon */}
        <PresetIcon iconPath="M12 2L20.5 6.5 22 15.5 16 22H8L2 15.5 3.5 6.5Z" />
        <span className="absolute right-0.5 bottom-0.5 text-[7px] leading-none text-slate-400">&#9656;</span>
      </button>
      {isOpen && (
        <div
          ref={panelRef}
          className="fixed z-[200] w-48 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Regular Polygon
          </div>
          <div className="text-xs font-medium text-slate-600 mb-2">Sides: {sides}</div>
          <input
            type="range"
            min={3}
            max={100}
            value={sides}
            onChange={e => onSidesChange(Math.min(100, Math.max(3, Number(e.target.value) || 3)))}
            className="w-full accent-indigo-600"
          />
          <div className="flex justify-between text-[10px] text-slate-400 mt-1">
            <span>3</span>
            <span>100</span>
          </div>
          <button
            type="button"
            onClick={handleCreate}
            className="mt-2 w-full rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition"
          >
            Create {sides}-gon
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Border color compact button with popover ── */

const BORDER_COLORS = EXPANDED_PALETTE.slice(0, 12)

function BorderColorButton({
  currentColor,
  onColorChange,
}: {
  currentColor?: string | null
  onColorChange: (color: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null)
  useClickOutside([containerRef, panelRef], open, () => setOpen(false))

  const hasBorder = !!currentColor

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPopoverPos({ top: rect.top, left: rect.right + 8 })
    }
    setOpen(!open)
  }

  return (
    <div ref={containerRef}>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        className="flex h-9 w-9 flex-col items-center justify-center rounded-lg transition hover:bg-slate-100"
        title="Border color"
      >
        <span
          className="h-5 w-5 rounded border-2"
          style={{
            borderColor: hasBorder ? currentColor : '#94a3b8',
            backgroundColor: 'transparent',
          }}
        />
      </button>
      {open && popoverPos && (
        <div
          ref={panelRef}
          className="fixed z-[200] w-44 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
          style={{ top: popoverPos.top, left: popoverPos.left }}
        >
          <div className="text-xs font-medium text-slate-500 mb-2">Border</div>
          <div className="grid grid-cols-6 gap-1">
            <button
              type="button"
              onClick={() => { onColorChange(null); setOpen(false) }}
              className={`h-6 w-6 rounded-full border-2 border-slate-300 flex items-center justify-center transition hover:scale-110 ${
                !currentColor ? 'ring-2 ring-slate-700 ring-offset-1' : ''
              }`}
              title="No border"
            >
              <span className="text-xs text-red-400 font-bold">/</span>
            </button>
            {BORDER_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => { onColorChange(color); setOpen(false) }}
                className={`h-6 w-6 rounded-full transition hover:scale-110 ${
                  color === currentColor ? 'ring-2 ring-slate-700 ring-offset-1' : ''
                }`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
