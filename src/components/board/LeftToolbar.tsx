'use client'

import { useState, useCallback, ReactNode } from 'react'
import { BoardRole } from '@/types/sharing'
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
import { FilePickerFlyout } from './FilePickerFlyout'

const SUBMENU_MIN_WIDTH = { minWidth: '160px' } as const
const SUBMENU_MIN_WIDTH_SM = { minWidth: '120px' } as const
const SUBMENU_MIN_WIDTH_MD = { minWidth: '140px' } as const
const SUBMENU_MIN_WIDTH_LG = { minWidth: '180px' } as const

interface LeftToolbarProps {
  userRole: BoardRole
  isEditingText: boolean
  activePreset: ShapePreset | null
  onPresetSelect: (preset: ShapePreset) => void
  boardId?: string
  onFilePick?: (file: import('./FileLibraryPanel').FileRecord) => void
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
  ...SYMBOL_PRESETS.map(p => p.id),
  ...FLOWCHART_PRESETS.map(p => p.id),
]

export function LeftToolbar({
  userRole,
  isEditingText,
  activePreset,
  onPresetSelect,
  boardId,
  onFilePick,
}: LeftToolbarProps) {
  const canEdit = userRole !== 'viewer'
  const [openGroupId, setOpenGroupId] = useState<string | null>(null)
  const [ngonSides, setNgonSides] = useState(5)
  const [filePickerOpen, setFilePickerOpen] = useState(false)

  const closeFlyout = useCallback(() => setOpenGroupId(null), [])
  const handlePresetSelect = useCallback((p: ShapePreset) => {
    onPresetSelect(p)
    closeFlyout()
  }, [onPresetSelect, closeFlyout])

  return (
    <div className="@container h-full">
    <aside className="flex w-[clamp(56px,5.5vw,72px)] shrink-0 flex-col items-center gap-0.5 border-r py-2 overflow-y-auto border-parchment-border bg-parchment dark:border-white/10 dark:bg-[#111827]">
      {canEdit && (
        <>
          {/* Shape tools — fades out when editing text */}
          <div
            style={{
              opacity: isEditingText ? 0 : 1,
              pointerEvents: isEditingText ? 'none' : 'auto',
              transition: 'opacity 150ms ease',
              position: isEditingText ? 'absolute' : 'relative',
            }}
          >
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
              <div style={SUBMENU_MIN_WIDTH}>
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
              <div className="grid grid-cols-3 gap-1" style={SUBMENU_MIN_WIDTH_MD}>
                {STANDALONE_PRESETS.filter(p => p.id === 'sticky_note' || p.id === 'text_box').map(preset => (
                  <FlyoutPresetButton key={preset.id} preset={preset} activePreset={activePreset} onSelect={handlePresetSelect} />
                ))}
                <FlyoutPresetButton preset={FRAME_PRESET} activePreset={activePreset} onSelect={handlePresetSelect} />
                <FlyoutPresetButton preset={TABLE_PRESET} activePreset={activePreset} onSelect={handlePresetSelect} />
                <FlyoutPlaceholder label="Connector" iconPath="M4 20h2a4 4 0 0 0 4-4v-8a4 4 0 0 1 4-4h2 M18 4l2 4-2 4" />
                <FlyoutPlaceholder label="Web Frame" iconPath="M3 3h18v18H3z M3 9h18 M9 9v12" />
                <button
                  type="button"
                  onClick={() => { closeFlyout(); setFilePickerOpen(prev => !prev) }}
                  className={`flex flex-col items-center justify-center rounded-lg p-1.5 transition ${
                    filePickerOpen
                      ? 'bg-navy/10 text-navy dark:bg-navy/30 dark:text-parchment'
                      : 'text-charcoal/70 hover:bg-parchment-dark dark:text-parchment/60 dark:hover:bg-white/10'
                  }`}
                  title="File"
                >
                  <PresetIcon iconPath="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 13h6 M9 17h4" className="h-5 w-5" />
                  <span className="text-[8px] mt-0.5 leading-tight truncate w-full text-center text-charcoal/70 dark:text-parchment/60">File</span>
                </button>
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
              <div className="grid grid-cols-2 gap-1" style={SUBMENU_MIN_WIDTH_SM}>
                {LINE_PRESETS.map(preset => (
                  <FlyoutPresetButton key={preset.id} preset={preset} activePreset={activePreset} onSelect={handlePresetSelect} />
                ))}
                {LINE_PLACEHOLDER_PRESETS.map(p => (
                  <FlyoutPlaceholder key={p.label} label={p.label} iconPath={p.iconPath} />
                ))}
              </div>
            </ToolGroupButton>

            {/* ── Shapes (merged: shapes + ngon + symbols) ── */}
            <MergedShapesGroupButton
              isOpen={openGroupId === 'shapes'}
              activePreset={activePreset}
              isActive={!!activePreset && (SHAPES_IDS.includes(activePreset.id) || !!activePreset.id.startsWith('ngon_'))}
              sides={ngonSides}
              onSidesChange={setNgonSides}
              onToggle={() => setOpenGroupId(prev => prev === 'shapes' ? null : 'shapes')}
              onPresetSelect={handlePresetSelect}
              onClose={closeFlyout}
            />

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
              <div style={SUBMENU_MIN_WIDTH}>
                <FlyoutHeader text="Content" />
                <div className="grid grid-cols-3 gap-1">
                  {CONTENT_PRESETS.map(preset => (
                    <FlyoutPresetButton key={preset.id} preset={preset} activePreset={activePreset} onSelect={handlePresetSelect} />
                  ))}
                </div>
              </div>
            </ToolGroupButton>
          </div>

          {/* Text editing indicator — shape tools fade out while editing */}
          {isEditingText && (
            <div className="px-1.5 py-2 text-center">
              <div className="text-[8px] font-semibold uppercase tracking-widest text-charcoal/50 dark:text-parchment/40 leading-tight">
                Editing
              </div>
              <div className="text-[8px] text-charcoal/40 dark:text-parchment/30 leading-tight mt-0.5">
                Use bar above object
              </div>
            </div>
          )}
        </>
      )}

      {filePickerOpen && boardId && onFilePick && (
        <FilePickerFlyout
          boardId={boardId}
          onSelect={(file) => {
            onFilePick(file)
            setFilePickerOpen(false)
          }}
          onClose={() => setFilePickerOpen(false)}
        />
      )}
    </aside>
    </div>
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
  const { containerRef, btnRef, panelRef, panelPos, posReady } = useFlyoutPosition(isOpen)
  useClickOutside([containerRef, panelRef], isOpen, onClose)

  return (
    <div ref={containerRef}>
      <button
        ref={btnRef}
        type="button"
        onClick={onToggle}
        className={`relative flex w-[clamp(44px,4.5vw,56px)] flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 transition ${
          isActive || isOpen
            ? 'bg-navy text-parchment shadow-md shadow-leather/30 dark:bg-navy dark:text-parchment'
            : 'text-charcoal/70 hover:bg-charcoal/10 hover:text-charcoal dark:text-parchment/60 dark:hover:bg-navy/40'
        }`}
        title={label}
      >
        <PresetIcon iconPath={iconPath} />
        <span className="text-[8px] leading-tight font-medium">{label}</span>
      </button>
      {isOpen && (
        <div
          ref={panelRef}
          className="fixed z-[200] rounded-xl border p-2 shadow-lg ring-1 ring-black/10 border-parchment-border bg-parchment dark:border-white/10 dark:bg-[#1E293B] dark:ring-white/10 animate-[flyout-in]"
          style={{ top: panelPos.top, left: panelPos.left, visibility: posReady ? 'visible' : 'hidden' }}
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

/* ── Merged Shapes group (shapes + ngon + symbols) ── */

function MergedShapesGroupButton({ isOpen, activePreset, isActive, sides, onSidesChange, onToggle, onPresetSelect, onClose }: {
  isOpen: boolean
  activePreset: ShapePreset | null
  isActive: boolean
  sides: number
  onSidesChange: (s: number) => void
  onToggle: () => void
  onPresetSelect: (p: ShapePreset) => void
  onClose: () => void
}) {
  const { containerRef, btnRef, panelRef, panelPos, posReady } = useFlyoutPosition(isOpen)
  useClickOutside([containerRef, panelRef], isOpen, onClose)

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
    onClose()
  }, [sides, onPresetSelect, onClose])

  return (
    <div ref={containerRef}>
      <button
        ref={btnRef}
        type="button"
        onClick={onToggle}
        className={`relative flex w-[clamp(44px,4.5vw,56px)] flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 transition ${
          isActive || isOpen
            ? 'bg-navy text-parchment shadow-md shadow-leather/30 dark:bg-navy dark:text-parchment'
            : 'text-charcoal/70 hover:bg-charcoal/10 hover:text-charcoal dark:text-parchment/60 dark:hover:bg-navy/40'
        }`}
        title="Shapes"
      >
        <PresetIcon iconPath="M3 3h18v18H3z" />
        <span className="text-[8px] leading-tight font-medium">Shapes</span>
      </button>
      {isOpen && (
        <div
          ref={panelRef}
          className="fixed z-[200] rounded-xl border p-2 shadow-lg ring-1 ring-black/10 border-parchment-border bg-parchment dark:border-white/10 dark:bg-[#1E293B] dark:ring-white/10 animate-[flyout-in]"
          style={{ top: panelPos.top, left: panelPos.left, visibility: posReady ? 'visible' : 'hidden' }}
        >
          <div style={SUBMENU_MIN_WIDTH_LG}>
            <FlyoutHeader text="Circle" />
            <div className="grid grid-cols-3 gap-1 mb-2">
              {STANDALONE_PRESETS.filter(p => p.id === 'circle').map(preset => (
                <FlyoutPresetButton key={preset.id} preset={preset} activePreset={activePreset} onSelect={onPresetSelect} />
              ))}
            </div>
            <FlyoutHeader text="Triangles" />
            <div className="grid grid-cols-3 gap-1 mb-2">
              {TRIANGLE_PRESETS.map(preset => (
                <FlyoutPresetButton key={preset.id} preset={preset} activePreset={activePreset} onSelect={onPresetSelect} />
              ))}
            </div>
            <FlyoutHeader text="Quadrilaterals" />
            <div className="grid grid-cols-3 gap-1 mb-2">
              {QUAD_PRESETS.map(preset => (
                <FlyoutPresetButton key={preset.id} preset={preset} activePreset={activePreset} onSelect={onPresetSelect} />
              ))}
            </div>
            <FlyoutHeader text="Stars & Shapes" />
            <div className="grid grid-cols-3 gap-1 mb-2">
              {SYMBOL_PRESETS.map(preset => (
                <FlyoutPresetButton key={preset.id} preset={preset} activePreset={activePreset} onSelect={onPresetSelect} />
              ))}
            </div>
            <FlyoutHeader text="Flowchart" />
            <div className="grid grid-cols-3 gap-1 mb-2">
              {FLOWCHART_PRESETS.map(preset => (
                <FlyoutPresetButton key={preset.id} preset={preset} activePreset={activePreset} onSelect={onPresetSelect} />
              ))}
            </div>
            <FlyoutHeader text="Regular Polygon" />
            <div className="px-1">
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
          </div>
        </div>
      )}
    </div>
  )
}
