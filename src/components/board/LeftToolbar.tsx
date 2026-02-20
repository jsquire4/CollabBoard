'use client'

import { useState, useRef, useEffect, useCallback, ReactNode } from 'react'
import { BoardRole } from '@/types/sharing'
import { ColorPicker } from './ColorPicker'
import { FontSelector } from './FontSelector'
import type { BoardObjectType, FontStyle } from '@/types/board'
import type { ShapePreset } from './shapePresets'
import {
  STANDALONE_PRESETS,
  FRAME_PRESET,
  TABLE_PRESET,
  LINE_PRESETS,
  LINE_PLACEHOLDER_PRESETS,
  TRIANGLE_PRESETS,
  QUAD_PRESETS,
  SYMBOL_PRESETS,
  FLOWCHART_PRESETS,
} from './shapePresets'
import { useClickOutside } from '@/hooks/useClickOutside'
import { EXPANDED_PALETTE } from './ColorPicker'
import { StylePanel } from './StylePanel'
import { RichTextToolbar } from './RichTextToolbar'
import { RICH_TEXT_ENABLED } from '@/lib/richText'
import type { Editor } from '@tiptap/react'

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
  selectedStrokeWidth?: number
  selectedStrokeDash?: string
  selectedOpacity?: number
  selectedShadowBlur?: number
  selectedCornerRadius?: number
  showCornerRadius?: boolean
  onStrokeColorChange: (color: string | null) => void
  onStrokeStyleChange?: (updates: { stroke_color?: string | null; stroke_width?: number; stroke_dash?: string }) => void
  onOpacityChange?: (opacity: number) => void
  onShadowChange?: (updates: { shadow_blur?: number; shadow_color?: string; shadow_offset_x?: number; shadow_offset_y?: number }) => void
  onCornerRadiusChange?: (corner_radius: number) => void
  anySelectedLocked?: boolean
  activePreset: ShapePreset | null
  onPresetSelect: (preset: ShapePreset) => void
  uiDarkMode?: boolean
  richTextEditor?: Editor | null
  selectedTableHeaderBg?: string
  selectedTableHeaderTextColor?: string
  onTableHeaderStyleChange?: (updates: { header_bg?: string; header_text_color?: string }) => void
}

// IDs that belong to each tool group (for active-state highlighting)
const BASICS_IDS = ['sticky_note', 'text_box', 'frame', 'table']
const LINES_IDS = ['line', 'arrow']
const SHAPES_IDS = [
  'circle',
  ...['equilateral', 'right_triangle', 'isosceles'],
  ...['rectangle', 'square', 'parallelogram', 'rhombus', 'trapezoid'],
]
const SYMBOLS_IDS = [
  ...SYMBOL_PRESETS.map(p => p.id),
  ...FLOWCHART_PRESETS.map(p => p.id),
]

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
  selectedStrokeWidth,
  selectedStrokeDash,
  selectedOpacity,
  selectedShadowBlur,
  selectedCornerRadius,
  showCornerRadius,
  onStrokeColorChange,
  onStrokeStyleChange,
  onOpacityChange,
  onShadowChange,
  onCornerRadiusChange,
  anySelectedLocked,
  activePreset,
  onPresetSelect,
  uiDarkMode = false,
  richTextEditor,
  selectedTableHeaderBg,
  selectedTableHeaderTextColor,
  onTableHeaderStyleChange,
}: LeftToolbarProps) {
  const canEdit = userRole !== 'viewer'
  const dk = uiDarkMode
  const [openGroupId, setOpenGroupId] = useState<string | null>(null)
  const [ngonSides, setNgonSides] = useState(5)

  const closeFlyout = useCallback(() => setOpenGroupId(null), [])
  const handlePresetSelect = useCallback((p: ShapePreset) => {
    onPresetSelect(p)
    closeFlyout()
  }, [onPresetSelect, closeFlyout])

  return (
    <aside className={`flex w-16 shrink-0 flex-col items-center gap-0.5 border-r py-2 overflow-y-auto ${dk ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
      {canEdit && (
        <>
          {isEditingText ? (
            <div onMouseDown={e => e.preventDefault()}>
              <div className="mb-1 w-full px-1.5">
                <div className={`text-[9px] font-semibold uppercase tracking-wider text-center ${dk ? 'text-slate-500' : 'text-slate-400'}`}>
                  Text
                </div>
              </div>
              {RICH_TEXT_ENABLED && richTextEditor ? (
                <RichTextToolbar editor={richTextEditor} dark={dk} />
              ) : (
                <FontSelector
                  dark={dk}
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
              )}
            </div>
          ) : (
            <>
              {/* ── Basics ── */}
              <ToolGroupButton
                id="basics"
                label="Basics"
                iconPath="M4 4h16v13.17L14.17 22H4V4z M14 17v5 M14 22h6"
                isOpen={openGroupId === 'basics'}
                isActive={!!activePreset && BASICS_IDS.includes(activePreset.id)}
                onToggle={() => setOpenGroupId(prev => prev === 'basics' ? null : 'basics')}
                onClose={closeFlyout}
                dark={dk}
              >
                <FlyoutHeader dark={dk} text="Basics" />
                <div className="grid grid-cols-3 gap-1" style={{ minWidth: '140px' }}>
                  {STANDALONE_PRESETS.filter(p => p.id === 'sticky_note' || p.id === 'text_box').map(preset => (
                    <FlyoutPresetButton key={preset.id} preset={preset} activePreset={activePreset} onSelect={handlePresetSelect} dark={dk} />
                  ))}
                  <FlyoutPresetButton preset={FRAME_PRESET} activePreset={activePreset} onSelect={handlePresetSelect} dark={dk} />
                  <FlyoutPresetButton preset={TABLE_PRESET} activePreset={activePreset} onSelect={handlePresetSelect} dark={dk} />
                  <FlyoutPlaceholder label="Connector" iconPath="M4 20h2a4 4 0 0 0 4-4v-8a4 4 0 0 1 4-4h2 M18 4l2 4-2 4" dark={dk} />
                  <FlyoutPlaceholder label="Web Frame" iconPath="M3 3h18v18H3z M3 9h18 M9 9v12" dark={dk} />
                  <FlyoutPlaceholder label="File" iconPath="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 13h6 M9 17h4" dark={dk} />
                </div>
              </ToolGroupButton>

              {/* ── Lines ── */}
              <ToolGroupButton
                id="lines"
                label="Lines"
                iconPath="M5 12h14"
                isOpen={openGroupId === 'lines'}
                isActive={!!activePreset && LINES_IDS.includes(activePreset.id)}
                onToggle={() => setOpenGroupId(prev => prev === 'lines' ? null : 'lines')}
                onClose={closeFlyout}
                dark={dk}
              >
                <FlyoutHeader dark={dk} text="Lines" />
                <div className="grid grid-cols-2 gap-1" style={{ minWidth: '120px' }}>
                  {LINE_PRESETS.map(preset => (
                    <FlyoutPresetButton key={preset.id} preset={preset} activePreset={activePreset} onSelect={handlePresetSelect} dark={dk} />
                  ))}
                  {LINE_PLACEHOLDER_PRESETS.map(p => (
                    <FlyoutPlaceholder key={p.label} label={p.label} iconPath={p.iconPath} dark={dk} />
                  ))}
                </div>
              </ToolGroupButton>

              {/* ── Shapes ── */}
              <ToolGroupButton
                id="shapes"
                label="Shapes"
                iconPath="M3 3h18v18H3z"
                isOpen={openGroupId === 'shapes'}
                isActive={!!activePreset && SHAPES_IDS.includes(activePreset.id)}
                onToggle={() => setOpenGroupId(prev => prev === 'shapes' ? null : 'shapes')}
                onClose={closeFlyout}
                dark={dk}
              >
                <div style={{ minWidth: '180px' }}>
                  <FlyoutHeader dark={dk} text="Circle" />
                  <div className="grid grid-cols-3 gap-1 mb-2">
                    {STANDALONE_PRESETS.filter(p => p.id === 'circle').map(preset => (
                      <FlyoutPresetButton key={preset.id} preset={preset} activePreset={activePreset} onSelect={handlePresetSelect} dark={dk} />
                    ))}
                  </div>
                  <FlyoutHeader dark={dk} text="Triangles" />
                  <div className="grid grid-cols-3 gap-1 mb-2">
                    {TRIANGLE_PRESETS.map(preset => (
                      <FlyoutPresetButton key={preset.id} preset={preset} activePreset={activePreset} onSelect={handlePresetSelect} dark={dk} />
                    ))}
                  </div>
                  <FlyoutHeader dark={dk} text="Quadrilaterals" />
                  <div className="grid grid-cols-3 gap-1">
                    {QUAD_PRESETS.map(preset => (
                      <FlyoutPresetButton key={preset.id} preset={preset} activePreset={activePreset} onSelect={handlePresetSelect} dark={dk} />
                    ))}
                  </div>
                </div>
              </ToolGroupButton>

              {/* ── N-gon ── */}
              <NgonGroupButton
                isOpen={openGroupId === 'ngon'}
                activePreset={activePreset}
                sides={ngonSides}
                onSidesChange={setNgonSides}
                onToggle={() => setOpenGroupId(prev => prev === 'ngon' ? null : 'ngon')}
                onPresetSelect={handlePresetSelect}
                onClose={closeFlyout}
                dark={dk}
              />

              {/* ── Symbols ── */}
              <ToolGroupButton
                id="symbols"
                label="Symbols"
                iconPath="M12 2l2.9 6.3 6.9.8-5 5.1 1.2 6.9L12 17.8 6 21.1l1.2-6.9-5-5.1 6.9-.8z"
                isOpen={openGroupId === 'symbols'}
                isActive={!!activePreset && SYMBOLS_IDS.includes(activePreset.id)}
                onToggle={() => setOpenGroupId(prev => prev === 'symbols' ? null : 'symbols')}
                onClose={closeFlyout}
                dark={dk}
              >
                <div style={{ minWidth: '160px' }}>
                  <FlyoutHeader dark={dk} text="Stars & Shapes" />
                  <div className="grid grid-cols-3 gap-1 mb-2">
                    {SYMBOL_PRESETS.map(preset => (
                      <FlyoutPresetButton key={preset.id} preset={preset} activePreset={activePreset} onSelect={handlePresetSelect} dark={dk} />
                    ))}
                  </div>
                  <FlyoutHeader dark={dk} text="Flowchart" />
                  <div className="grid grid-cols-3 gap-1">
                    {FLOWCHART_PRESETS.map(preset => (
                      <FlyoutPresetButton key={preset.id} preset={preset} activePreset={activePreset} onSelect={handlePresetSelect} dark={dk} />
                    ))}
                  </div>
                </div>
              </ToolGroupButton>
            </>
          )}

          {/* ── Selection tools ── */}
          {hasSelection && (
            <div className={anySelectedLocked ? 'opacity-50 pointer-events-none' : ''}>
              <Divider dark={dk} />
              <ColorPicker
                selectedColor={selectedColor}
                onColorChange={onColorChange}
                compact
                dark={dk}
                label="Fill"
              />
              {selectedTableHeaderBg !== undefined && (
                <>
                  <ColorPicker
                    selectedColor={selectedTableHeaderBg}
                    onColorChange={(c) => onTableHeaderStyleChange?.({ header_bg: c })}
                    compact
                    dark={dk}
                    label="Header"
                  />
                  <ColorPicker
                    selectedColor={selectedTableHeaderTextColor}
                    onColorChange={(c) => onTableHeaderStyleChange?.({ header_text_color: c })}
                    compact
                    dark={dk}
                    label="Hdr Text"
                  />
                </>
              )}
              <BorderColorButton
                currentColor={selectedStrokeColor}
                onColorChange={onStrokeColorChange}
                dark={dk}
              />
              {onStrokeStyleChange && onOpacityChange && onShadowChange && (
                <StylePanel
                  strokeColor={selectedStrokeColor}
                  strokeWidth={selectedStrokeWidth}
                  strokeDash={selectedStrokeDash}
                  opacity={selectedOpacity}
                  shadowBlur={selectedShadowBlur}
                  cornerRadius={selectedCornerRadius}
                  showCornerRadius={showCornerRadius}
                  onStrokeStyleChange={onStrokeStyleChange}
                  onOpacityChange={onOpacityChange}
                  onShadowChange={onShadowChange}
                  onCornerRadiusChange={onCornerRadiusChange}
                  compact
                  dark={dk}
                />
              )}
              <Divider dark={dk} />
              <button
                type="button"
                onClick={onDuplicate}
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${dk ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}
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
                  className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${dk ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}
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
                  className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${dk ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}
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
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${dk ? 'text-red-400 hover:bg-red-950' : 'text-red-500 hover:bg-red-50'}`}
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

function Divider({ dark = false }: { dark?: boolean }) {
  return <div className={`my-1 h-px w-8 ${dark ? 'bg-slate-700' : 'bg-slate-200'}`} />
}

/** SVG icon rendered from a path string in a 24x24 viewBox */
function PresetIcon({ iconPath, className = 'h-4.5 w-4.5', dark = false }: { iconPath: string; className?: string; dark?: boolean }) {
  return (
    <svg className={`${className} ${dark ? 'text-current' : 'text-slate-900'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={iconPath} />
    </svg>
  )
}

/* ── ToolGroupButton: flexible flyout wrapper ── */

function ToolGroupButton({
  id,
  label,
  iconPath,
  isOpen,
  isActive,
  onToggle,
  onClose,
  children,
  dark = false,
}: {
  id: string
  label: string
  iconPath: string
  isOpen: boolean
  isActive: boolean
  onToggle: () => void
  onClose: () => void
  children: ReactNode
  dark?: boolean
}) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  useClickOutside([containerRef, panelRef], isOpen, onClose)

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

  return (
    <div ref={containerRef}>
      <button
        ref={btnRef}
        type="button"
        onClick={onToggle}
        className={`relative flex h-9 w-9 flex-col items-center justify-center rounded-lg transition ${
          isActive || isOpen
            ? 'bg-indigo-100 text-indigo-700'
            : dark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
        }`}
        title={label}
      >
        <PresetIcon iconPath={iconPath} dark={dark} />
        <span className={`absolute right-0.5 bottom-0.5 text-[7px] leading-none ${dark ? 'text-slate-600' : 'text-slate-400'}`}>&#9656;</span>
      </button>
      {isOpen && (
        <div
          ref={panelRef}
          className={`fixed z-[200] rounded-xl border p-2 shadow-xl ${dark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}
          style={{ top: pos.top, left: pos.left }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

/* ── Flyout sub-components ── */

function FlyoutHeader({ text, dark = false }: { text: string; dark?: boolean }) {
  return (
    <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1.5 px-1 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
      {text}
    </div>
  )
}

function FlyoutPresetButton({ preset, activePreset, onSelect, dark = false }: {
  preset: ShapePreset
  activePreset: ShapePreset | null
  onSelect: (p: ShapePreset) => void
  dark?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(preset)}
      className={`flex flex-col items-center justify-center rounded-lg p-1.5 transition ${
        activePreset?.id === preset.id ? 'bg-indigo-100 text-indigo-700' : dark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
      }`}
      title={preset.label}
    >
      <PresetIcon iconPath={preset.iconPath} className="h-5 w-5" dark={dark} />
      <span className={`text-[8px] mt-0.5 leading-tight truncate w-full text-center ${dark ? 'text-slate-400' : ''}`}>{preset.label}</span>
    </button>
  )
}

function FlyoutPlaceholder({ label, iconPath, dark = false }: { label: string; iconPath: string; dark?: boolean }) {
  return (
    <button
      type="button"
      disabled
      className={`flex flex-col items-center justify-center rounded-lg p-1.5 cursor-not-allowed ${dark ? 'text-slate-600' : 'text-slate-300'}`}
      title={`${label} (coming soon)`}
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d={iconPath} />
      </svg>
      <span className="text-[8px] mt-0.5 leading-tight truncate w-full text-center">{label}</span>
    </button>
  )
}

/* ── N-gon group with slider ── */

function NgonGroupButton({ isOpen, activePreset, sides, onSidesChange, onToggle, onPresetSelect, onClose, dark = false }: {
  isOpen: boolean
  activePreset: ShapePreset | null
  sides: number
  onSidesChange: (s: number) => void
  onToggle: () => void
  onPresetSelect: (p: ShapePreset) => void
  onClose: () => void
  dark?: boolean
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
          isNgonActive || isOpen
            ? 'bg-indigo-100 text-indigo-700'
            : dark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
        }`}
        title="N-gon"
      >
        <PresetIcon iconPath="M12 2L20.5 6.5 22 15.5 16 22H8L2 15.5 3.5 6.5Z" dark={dark} />
        <span className={`absolute right-0.5 bottom-0.5 text-[7px] leading-none ${dark ? 'text-slate-600' : 'text-slate-400'}`}>&#9656;</span>
      </button>
      {isOpen && (
        <div
          ref={panelRef}
          className={`fixed z-[200] w-48 rounded-xl border p-3 shadow-xl ${dark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}
          style={{ top: pos.top, left: pos.left }}
        >
          <div className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
            Regular Polygon
          </div>
          <div className={`text-xs font-medium mb-2 ${dark ? 'text-slate-300' : 'text-slate-600'}`}>Sides: {sides}</div>
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
  dark = false,
}: {
  currentColor?: string | null
  onColorChange: (color: string | null) => void
  dark?: boolean
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
        className={`flex h-9 w-9 flex-col items-center justify-center rounded-lg transition ${dark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}
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
          className={`fixed z-[200] w-44 rounded-xl border p-3 shadow-xl ${dark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}
          style={{ top: popoverPos.top, left: popoverPos.left }}
        >
          <div className={`text-xs font-medium mb-2 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>Border</div>
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
