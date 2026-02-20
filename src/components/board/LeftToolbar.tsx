'use client'

import { useState, useCallback, ReactNode } from 'react'
import { BoardRole } from '@/types/sharing'
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
  AGENT_PRESETS,
  DATA_PRESETS,
  CONTENT_PRESETS,
} from './shapePresets'
import { useClickOutside } from '@/hooks/useClickOutside'
import { useFlyoutPosition } from '@/hooks/useFlyoutPosition'
import { RichTextToolbar } from './RichTextToolbar'
import { RICH_TEXT_ENABLED } from '@/lib/richText'
import type { Editor } from '@tiptap/react'

interface LeftToolbarProps {
  userRole: BoardRole
  activeTool: BoardObjectType | null
  isEditingText: boolean
  selectedFontFamily?: string
  selectedFontSize?: number
  selectedFontStyle?: FontStyle
  selectedTextAlign?: string
  selectedTextVerticalAlign?: string
  selectedTextColor?: string
  onFontChange: (updates: { font_family?: string; font_size?: number; font_style?: FontStyle }) => void
  onTextStyleChange: (updates: { text_align?: string; text_vertical_align?: string; text_color?: string }) => void
  activePreset: ShapePreset | null
  onPresetSelect: (preset: ShapePreset) => void
  uiDarkMode?: boolean
  richTextEditor?: Editor | null
}

// IDs that belong to each tool group (for active-state highlighting)
const BASICS_IDS = ['sticky_note', 'text_box', 'frame', 'table']
const LINES_IDS = ['line', 'arrow']
const AGENTS_IDS = ['agent', 'agent_output', 'context_object', 'data_connector', 'api_object']
const CONTENT_IDS = ['text', 'status_badge', 'section_header', 'metric_card', 'checklist']
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
  isEditingText,
  selectedFontFamily,
  selectedFontSize,
  selectedFontStyle,
  selectedTextAlign,
  selectedTextVerticalAlign,
  selectedTextColor,
  onFontChange,
  onTextStyleChange,
  activePreset,
  onPresetSelect,
  uiDarkMode = false,
  richTextEditor,
}: LeftToolbarProps) {
  const canEdit = userRole !== 'viewer'
  const [openGroupId, setOpenGroupId] = useState<string | null>(null)
  const [ngonSides, setNgonSides] = useState(5)

  const closeFlyout = useCallback(() => setOpenGroupId(null), [])
  const handlePresetSelect = useCallback((p: ShapePreset) => {
    onPresetSelect(p)
    closeFlyout()
  }, [onPresetSelect, closeFlyout])

  return (
    <aside className="flex w-[52px] shrink-0 flex-col items-center gap-0.5 border-r py-2 overflow-y-auto border-parchment-border bg-parchment dark:border-white/10 dark:bg-[#111827]">
      {canEdit && (
        <>
          {isEditingText ? (
            <div onMouseDown={e => e.preventDefault()}>
              <div className="mb-1 w-full px-1.5">
                <div className="text-[9px] font-semibold uppercase tracking-widest text-center text-charcoal/70 dark:text-parchment/60">
                  Text
                </div>
              </div>
              {RICH_TEXT_ENABLED && richTextEditor ? (
                <RichTextToolbar editor={richTextEditor} dark={uiDarkMode} />
              ) : (
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
              )}
            </div>
          ) : (
            <>
              {/* ── Agents ── */}
              <ToolGroupButton
                id="agents"
                label="Agents"
                iconPath="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                isOpen={openGroupId === 'agents'}
                isActive={!!activePreset && AGENTS_IDS.includes(activePreset.id)}
                onToggle={() => setOpenGroupId(prev => prev === 'agents' ? null : 'agents')}
                onClose={closeFlyout}
              >
                <div style={{ minWidth: '160px' }}>
                  <FlyoutHeader text="Agents" />
                  <div className="grid grid-cols-3 gap-1 mb-2">
                    {AGENT_PRESETS.map(preset => (
                      <FlyoutPresetButton key={preset.id} preset={preset} activePreset={activePreset} onSelect={handlePresetSelect} />
                    ))}
                  </div>
                  <FlyoutHeader text="Data" />
                  <div className="grid grid-cols-3 gap-1">
                    {DATA_PRESETS.map(preset => (
                      <FlyoutPresetButton key={preset.id} preset={preset} activePreset={activePreset} onSelect={handlePresetSelect} />
                    ))}
                  </div>
                </div>
              </ToolGroupButton>

              {/* ── Basics ── */}
              <ToolGroupButton
                id="basics"
                label="Basics"
                iconPath="M4 4h16v13.17L14.17 22H4V4z M14 17v5 M14 22h6"
                isOpen={openGroupId === 'basics'}
                isActive={!!activePreset && BASICS_IDS.includes(activePreset.id)}
                onToggle={() => setOpenGroupId(prev => prev === 'basics' ? null : 'basics')}
                onClose={closeFlyout}
              >
                <FlyoutHeader text="Basics" />
                <div className="grid grid-cols-3 gap-1" style={{ minWidth: '140px' }}>
                  {STANDALONE_PRESETS.filter(p => p.id === 'sticky_note' || p.id === 'text_box').map(preset => (
                    <FlyoutPresetButton key={preset.id} preset={preset} activePreset={activePreset} onSelect={handlePresetSelect} />
                  ))}
                  <FlyoutPresetButton preset={FRAME_PRESET} activePreset={activePreset} onSelect={handlePresetSelect} />
                  <FlyoutPresetButton preset={TABLE_PRESET} activePreset={activePreset} onSelect={handlePresetSelect} />
                  <FlyoutPlaceholder label="Connector" iconPath="M4 20h2a4 4 0 0 0 4-4v-8a4 4 0 0 1 4-4h2 M18 4l2 4-2 4" />
                  <FlyoutPlaceholder label="Web Frame" iconPath="M3 3h18v18H3z M3 9h18 M9 9v12" />
                  <FlyoutPlaceholder label="File" iconPath="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 13h6 M9 17h4" />
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
              >
                <FlyoutHeader text="Lines" />
                <div className="grid grid-cols-2 gap-1" style={{ minWidth: '120px' }}>
                  {LINE_PRESETS.map(preset => (
                    <FlyoutPresetButton key={preset.id} preset={preset} activePreset={activePreset} onSelect={handlePresetSelect} />
                  ))}
                  {LINE_PLACEHOLDER_PRESETS.map(p => (
                    <FlyoutPlaceholder key={p.label} label={p.label} iconPath={p.iconPath} />
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
              >
                <div style={{ minWidth: '180px' }}>
                  <FlyoutHeader text="Circle" />
                  <div className="grid grid-cols-3 gap-1 mb-2">
                    {STANDALONE_PRESETS.filter(p => p.id === 'circle').map(preset => (
                      <FlyoutPresetButton key={preset.id} preset={preset} activePreset={activePreset} onSelect={handlePresetSelect} />
                    ))}
                  </div>
                  <FlyoutHeader text="Triangles" />
                  <div className="grid grid-cols-3 gap-1 mb-2">
                    {TRIANGLE_PRESETS.map(preset => (
                      <FlyoutPresetButton key={preset.id} preset={preset} activePreset={activePreset} onSelect={handlePresetSelect} />
                    ))}
                  </div>
                  <FlyoutHeader text="Quadrilaterals" />
                  <div className="grid grid-cols-3 gap-1">
                    {QUAD_PRESETS.map(preset => (
                      <FlyoutPresetButton key={preset.id} preset={preset} activePreset={activePreset} onSelect={handlePresetSelect} />
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
              >
                <div style={{ minWidth: '160px' }}>
                  <FlyoutHeader text="Stars & Shapes" />
                  <div className="grid grid-cols-3 gap-1 mb-2">
                    {SYMBOL_PRESETS.map(preset => (
                      <FlyoutPresetButton key={preset.id} preset={preset} activePreset={activePreset} onSelect={handlePresetSelect} />
                    ))}
                  </div>
                  <FlyoutHeader text="Flowchart" />
                  <div className="grid grid-cols-3 gap-1">
                    {FLOWCHART_PRESETS.map(preset => (
                      <FlyoutPresetButton key={preset.id} preset={preset} activePreset={activePreset} onSelect={handlePresetSelect} />
                    ))}
                  </div>
                </div>
              </ToolGroupButton>

              {/* ── Content ── */}
              <ToolGroupButton
                id="content"
                label="Content"
                iconPath="M4 6h16M4 10h16M4 14h16M4 18h16"
                isOpen={openGroupId === 'content'}
                isActive={!!activePreset && CONTENT_IDS.includes(activePreset.id)}
                onToggle={() => setOpenGroupId(prev => prev === 'content' ? null : 'content')}
                onClose={closeFlyout}
              >
                <div style={{ minWidth: '160px' }}>
                  <FlyoutHeader text="Content" />
                  <div className="grid grid-cols-3 gap-1">
                    {CONTENT_PRESETS.map(preset => (
                      <FlyoutPresetButton key={preset.id} preset={preset} activePreset={activePreset} onSelect={handlePresetSelect} />
                    ))}
                  </div>
                </div>
              </ToolGroupButton>
            </>
          )}
        </>
      )}

    </aside>
  )
}

/* ── Shared small components ── */


/** SVG icon rendered from a path string in a 24x24 viewBox */
function PresetIcon({ iconPath, className = 'h-4.5 w-4.5' }: { iconPath: string; className?: string }) {
  return (
    <svg className={`${className} text-charcoal dark:text-parchment`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
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
}: {
  id: string
  label: string
  iconPath: string
  isOpen: boolean
  isActive: boolean
  onToggle: () => void
  onClose: () => void
  children: ReactNode
}) {
  const { containerRef, btnRef, panelRef, panelPos } = useFlyoutPosition(isOpen)
  useClickOutside([containerRef, panelRef], isOpen, onClose)

  return (
    <div ref={containerRef}>
      <button
        ref={btnRef}
        type="button"
        onClick={onToggle}
        className={`relative flex h-8 w-8 flex-col items-center justify-center rounded-lg transition ${
          isActive || isOpen
            ? 'bg-navy/10 text-navy dark:bg-navy/30 dark:text-parchment'
            : 'text-charcoal/70 hover:bg-parchment-dark dark:text-parchment/60 dark:hover:bg-white/10'
        }`}
        title={label}
      >
        <PresetIcon iconPath={iconPath} />
        <span className="absolute right-0.5 bottom-0.5 text-[7px] leading-none text-charcoal/40 dark:text-parchment/40">&#9656;</span>
      </button>
      {isOpen && (
        <div
          ref={panelRef}
          className="fixed z-[200] rounded-xl border p-2 shadow-lg ring-1 ring-black/10 border-parchment-border bg-parchment dark:border-white/10 dark:bg-[#1E293B] dark:ring-white/10"
          style={{ top: panelPos.top, left: panelPos.left }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

/* ── Flyout sub-components ── */

function FlyoutHeader({ text }: { text: string }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-widest mb-1.5 px-1 text-charcoal/70 dark:text-parchment/60">
      {text}
    </div>
  )
}

function FlyoutPresetButton({ preset, activePreset, onSelect }: {
  preset: ShapePreset
  activePreset: ShapePreset | null
  onSelect: (p: ShapePreset) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(preset)}
      className={`flex flex-col items-center justify-center rounded-lg p-1.5 transition ${
        activePreset?.id === preset.id
          ? 'bg-navy/10 text-navy dark:bg-navy/30 dark:text-parchment'
          : 'text-charcoal/70 hover:bg-parchment-dark dark:text-parchment/60 dark:hover:bg-white/10'
      }`}
      title={preset.label}
    >
      <PresetIcon iconPath={preset.iconPath} className="h-5 w-5" />
      <span className="text-[8px] mt-0.5 leading-tight truncate w-full text-center text-charcoal/70 dark:text-parchment/60">{preset.label}</span>
    </button>
  )
}

function FlyoutPlaceholder({ label, iconPath }: { label: string; iconPath: string }) {
  return (
    <button
      type="button"
      disabled
      className="flex flex-col items-center justify-center rounded-lg p-1.5 cursor-not-allowed text-charcoal/30 dark:text-parchment/30"
      title={`${label} (coming soon)`}
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d={iconPath} />
      </svg>
      <span className="text-[8px] mt-0.5 leading-tight truncate w-full text-center">{label}</span>
    </button>
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
  const { containerRef, btnRef, panelRef, panelPos } = useFlyoutPosition(isOpen)
  useClickOutside([containerRef, panelRef], isOpen, onClose)

  const isNgonActive = activePreset?.id.startsWith('ngon_')

  const handleCreate = useCallback(() => {
    const preset: ShapePreset = {
      id: `ngon_${sides}`,
      label: `${sides}-gon`,
      dbType: 'ngon',
      defaultWidth: 120,
      defaultHeight: 120,
      overrides: { sides, color: '#D4854A' },
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
        className={`relative flex h-8 w-8 flex-col items-center justify-center rounded-lg transition ${
          isNgonActive || isOpen
            ? 'bg-navy/10 text-navy dark:bg-navy/30 dark:text-parchment'
            : 'text-charcoal/70 hover:bg-parchment-dark dark:text-parchment/60 dark:hover:bg-white/10'
        }`}
        title="N-gon"
      >
        <PresetIcon iconPath="M12 2L20.5 6.5 22 15.5 16 22H8L2 15.5 3.5 6.5Z" />
        <span className="absolute right-0.5 bottom-0.5 text-[7px] leading-none text-charcoal/40 dark:text-parchment/40">&#9656;</span>
      </button>
      {isOpen && (
        <div
          ref={panelRef}
          className="fixed z-[200] w-48 rounded-xl border p-3 shadow-lg ring-1 ring-black/10 border-parchment-border bg-parchment dark:border-white/10 dark:bg-[#1E293B] dark:ring-white/10"
          style={{ top: panelPos.top, left: panelPos.left }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-widest mb-2 text-charcoal/70 dark:text-parchment/60">
            Regular Polygon
          </div>
          <div className="text-xs font-medium mb-2 text-charcoal/70 dark:text-parchment">Sides: {sides}</div>
          <input
            type="range"
            min={3}
            max={100}
            value={sides}
            onChange={e => onSidesChange(Math.min(100, Math.max(3, Number(e.target.value) || 3)))}
            className="w-full accent-navy"
          />
          <div className="flex justify-between text-[10px] text-charcoal/50 dark:text-parchment/60 mt-1">
            <span>3</span>
            <span>100</span>
          </div>
          <button
            type="button"
            onClick={handleCreate}
            className="mt-2 w-full rounded-lg bg-navy px-3 py-1.5 text-xs font-medium text-parchment hover:bg-navy/90 transition"
          >
            Create {sides}-gon
          </button>
        </div>
      )}
    </div>
  )
}
