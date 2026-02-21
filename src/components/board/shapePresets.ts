import type { BoardObjectType, BoardObject } from '@/types/board'
export { computeStarPoints } from '@/lib/geometry/starPoints'
export { scaleCustomPoints } from '@/lib/geometry/customPoints'
// Geometry functions live in @/lib/geometry/shapePoints — re-export for
// consumers who import them via shapePresets, and import locally for use
// in the preset data arrays below.
export {
  arcPoints,
  documentPoints,
  databasePoints,
  cloudPoints,
  terminatorPoints,
  delayPoints,
  blockArrowPoints,
} from '@/lib/geometry/shapePoints'
import {
  documentPoints,
  databasePoints,
  cloudPoints,
  terminatorPoints,
  delayPoints,
  blockArrowPoints,
} from '@/lib/geometry/shapePoints'

// ── Types ────────────────────────────────────────────────────

export interface ShapePreset {
  /** Unique key for this preset (e.g. "right_triangle", "5pt_star") */
  id: string
  label: string
  /** DB type to persist (most use 'ngon') */
  dbType: BoardObjectType
  /** Default width/height when click-to-place */
  defaultWidth: number
  defaultHeight: number
  /** Overrides merged into addObject — sides, custom_points, color, etc. */
  overrides?: Partial<BoardObject>
  /** SVG path for the icon (rendered inside a 24×24 viewBox) */
  iconPath: string
  /**
   * If custom_points are defined relative to defaultWidth/defaultHeight,
   * set this true so draw-to-create can scale them proportionally.
   */
  scalablePoints?: boolean
  /** If true, immediately enter text edit mode after creating this shape */
  autoEdit?: boolean
}

interface ShapeGroup {
  id: string
  label: string
  /** SVG path for the group button icon (24×24 viewBox) */
  iconPath: string
  presets: ShapePreset[]
}

// ── Helpers ──────────────────────────────────────────────────
// computeStarPoints and scaleCustomPoints are re-exported from @/lib/geometry
// (see top of file).  Import them here so local helpers can still call them.
import { computeStarPoints } from '@/lib/geometry/starPoints'

/** Serialize points as JSON string for custom_points field */
function pts(arr: number[]): string {
  return JSON.stringify(arr.map(n => Math.round(n * 100) / 100))
}

// ── Triangles ────────────────────────────────────────────────

export const TRIANGLE_PRESETS: ShapePreset[] = [
  {
    id: 'equilateral',
    label: 'Equilateral',
    dbType: 'triangle',
    defaultWidth: 100,
    defaultHeight: 90,
    iconPath: 'M12 2L2 22h20L12 2z',
  },
  {
    id: 'right_triangle',
    label: 'Right Triangle',
    dbType: 'ngon',
    defaultWidth: 100,
    defaultHeight: 90,
    overrides: {
      custom_points: pts([0, 90, 100, 90, 0, 0]),
      color: '#7B6FD4',
    },
    scalablePoints: true,
    iconPath: 'M3 21h18L3 3v18z',
  },
  {
    id: 'isosceles',
    label: 'Isosceles',
    dbType: 'ngon',
    defaultWidth: 80,
    defaultHeight: 100,
    overrides: {
      custom_points: pts([40, 0, 80, 100, 0, 100]),
      color: '#7B6FD4',
    },
    scalablePoints: true,
    iconPath: 'M12 2L20 22H4L12 2z',
  },
]

// ── Quadrilaterals ───────────────────────────────────────────

export const QUAD_PRESETS: ShapePreset[] = [
  {
    id: 'rectangle',
    label: 'Rectangle',
    dbType: 'rectangle',
    defaultWidth: 200,
    defaultHeight: 140,
    iconPath: 'M3 3h18v18H3z',
  },
  {
    id: 'square',
    label: 'Square',
    dbType: 'rectangle',
    defaultWidth: 140,
    defaultHeight: 140,
    overrides: { width: 140, height: 140 },
    iconPath: 'M4 4h16v16H4z',
  },
  {
    id: 'parallelogram',
    label: 'Parallelogram',
    dbType: 'parallelogram',
    defaultWidth: 140,
    defaultHeight: 80,
    iconPath: 'M5 4h14l-4 16H1L5 4z',
  },
  {
    id: 'rhombus',
    label: 'Rhombus',
    dbType: 'ngon',
    defaultWidth: 120,
    defaultHeight: 120,
    overrides: { sides: 4, color: '#D4854A' },
    iconPath: 'M12 2l10 10-10 10L2 12z',
  },
  {
    id: 'trapezoid',
    label: 'Trapezoid',
    dbType: 'ngon',
    defaultWidth: 140,
    defaultHeight: 80,
    overrides: {
      custom_points: pts([28, 0, 112, 0, 140, 80, 0, 80]),
      color: '#D4854A',
    },
    scalablePoints: true,
    iconPath: 'M6 4h12l4 16H2L6 4z',
  },
]

// ── Stars & Symbols ──────────────────────────────────────────

function starPreset(n: number, label: string, iconPath: string): ShapePreset {
  const w = 120, h = 120
  return {
    id: `${n}pt_star`,
    label,
    dbType: 'ngon',
    defaultWidth: w,
    defaultHeight: h,
    overrides: {
      custom_points: pts(computeStarPoints(n, w, h)),
      color: '#C9A84C',
    },
    scalablePoints: true,
    iconPath,
  }
}


export const SYMBOL_PRESETS: ShapePreset[] = [
  starPreset(4, '4-Point Star', 'M12 1l3.5 7.5L12 12 8.5 8.5zM12 12l3.5 3.5L12 23 8.5 15.5z M1 12l7.5-3.5L12 12l-3.5 3.5z M12 12l3.5-3.5L23 12l-7.5 3.5z'),
  starPreset(5, '5-Point Star', 'M12 2l2.9 6.3 6.9.8-5 5.1 1.2 6.9L12 17.8 6 21.1l1.2-6.9-5-5.1 6.9-.8z'),
  starPreset(6, '6-Point Star', 'M12 2l3 5.2h6l-3 5.2 3 5.2h-6L12 22l-3-5.2H3l3-5.2L3 6.4h6z'),
  starPreset(8, '8-Point Star', 'M12 1l2.1 4.5 4.5-2.1L17 8l5 1-2.1 4.5 4.5 2.1L20 17l1 5-4.5-2.1L14.4 24 12 20l-2.4 4-2.1-4.5L3 22l1-5-4.4-1.5 4.5-2.1L2 9l5-1-1.5-4.5 4.5 2.1z'),
  {
    id: 'cross',
    label: 'Cross',
    dbType: 'ngon',
    defaultWidth: 120,
    defaultHeight: 120,
    overrides: {
      custom_points: pts([
        40, 0, 80, 0, 80, 40, 120, 40, 120, 80, 80, 80, 80, 120, 40, 120, 40, 80, 0, 80, 0, 40, 40, 40,
      ]),
      color: '#C85C5C',
    },
    scalablePoints: true,
    iconPath: 'M8 2h8v6h6v8h-6v6H8v-6H2v-8h6z',
  },
  {
    id: 'house',
    label: 'House',
    dbType: 'ngon',
    defaultWidth: 120,
    defaultHeight: 120,
    overrides: {
      custom_points: pts([0, 48, 60, 0, 120, 48, 120, 120, 0, 120]),
      color: '#8896A5',
    },
    scalablePoints: true,
    iconPath: 'M3 10.5L12 3l9 7.5V21H3z',
  },
  {
    id: 'block_arrow_right',
    label: 'Arrow Right',
    dbType: 'ngon',
    defaultWidth: 140,
    defaultHeight: 80,
    overrides: {
      custom_points: pts(blockArrowPoints('right', 140, 80)),
      color: '#5B8DEF',
    },
    scalablePoints: true,
    iconPath: 'M2 8h12V4l8 8-8 8v-4H2z',
  },
  {
    id: 'block_arrow_left',
    label: 'Arrow Left',
    dbType: 'ngon',
    defaultWidth: 140,
    defaultHeight: 80,
    overrides: {
      custom_points: pts(blockArrowPoints('left', 140, 80)),
      color: '#5B8DEF',
    },
    scalablePoints: true,
    iconPath: 'M22 8H10V4L2 12l8 8v-4h12z',
  },
  {
    id: 'block_arrow_up',
    label: 'Arrow Up',
    dbType: 'ngon',
    defaultWidth: 80,
    defaultHeight: 140,
    overrides: {
      custom_points: pts(blockArrowPoints('up', 80, 140)),
      color: '#5B8DEF',
    },
    scalablePoints: true,
    iconPath: 'M8 22V10H4l8-8 8 8h-4v12z',
  },
  {
    id: 'block_arrow_down',
    label: 'Arrow Down',
    dbType: 'ngon',
    defaultWidth: 80,
    defaultHeight: 140,
    overrides: {
      custom_points: pts(blockArrowPoints('down', 80, 140)),
      color: '#5B8DEF',
    },
    scalablePoints: true,
    iconPath: 'M8 2v12H4l8 8 8-8h-4V2z',
  },
]

// ── Flowchart ────────────────────────────────────────────────
// documentPoints, databasePoints, cloudPoints, terminatorPoints, delayPoints
// are imported from @/lib/geometry/shapePoints (see top of file).

export const FLOWCHART_PRESETS: ShapePreset[] = [
  {
    id: 'document',
    label: 'Document',
    dbType: 'ngon',
    defaultWidth: 140,
    defaultHeight: 100,
    overrides: {
      custom_points: pts(documentPoints(140, 100)),
      color: '#5B8DEF',
    },
    scalablePoints: true,
    iconPath: 'M4 2h16v16c0 0-4-2-8 0s-8 2-8 2V2z',
  },
  {
    id: 'database',
    label: 'Database',
    dbType: 'ngon',
    defaultWidth: 100,
    defaultHeight: 120,
    overrides: {
      custom_points: pts(databasePoints(100, 120)),
      color: '#7B6FD4',
    },
    scalablePoints: true,
    iconPath: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3v12c0 1.7-3.6 3-8 3s-8-1.3-8-3V6z M4 6c0 1.7 3.6 3 8 3s8-1.3 8-3',
  },
  {
    id: 'cloud',
    label: 'Cloud',
    dbType: 'ngon',
    defaultWidth: 140,
    defaultHeight: 100,
    overrides: {
      custom_points: pts(cloudPoints(140, 100)),
      color: '#5B8DEF',
    },
    scalablePoints: true,
    iconPath: 'M6 19a5 5 0 0 1-.5-9.96A7 7 0 0 1 18.5 9 4.5 4.5 0 0 1 18 18H6z',
  },
  {
    id: 'terminator',
    label: 'Terminator',
    dbType: 'ngon',
    defaultWidth: 160,
    defaultHeight: 60,
    overrides: {
      custom_points: pts(terminatorPoints(160, 60)),
      color: '#3D9E8C',
    },
    scalablePoints: true,
    iconPath: 'M7 7h10a5 5 0 0 1 0 10H7a5 5 0 0 1 0-10z',
  },
  {
    id: 'manual_input',
    label: 'Manual Input',
    dbType: 'ngon',
    defaultWidth: 140,
    defaultHeight: 80,
    overrides: {
      custom_points: pts([0, 20, 140, 0, 140, 80, 0, 80]),
      color: '#C9A84C',
    },
    scalablePoints: true,
    iconPath: 'M3 7l18-3v18H3z',
  },
  {
    id: 'delay',
    label: 'Delay',
    dbType: 'ngon',
    defaultWidth: 120,
    defaultHeight: 80,
    overrides: {
      custom_points: pts(delayPoints(120, 80)),
      color: '#C4907A',
    },
    scalablePoints: true,
    iconPath: 'M3 4h10a7 7 0 0 1 0 16H3z',
  },
]

// ── Standalone / lines ──────────────────────────────────────

export const STANDALONE_PRESETS: ShapePreset[] = [
  {
    id: 'sticky_note',
    label: 'Note',
    dbType: 'sticky_note',
    defaultWidth: 150,
    defaultHeight: 150,
    iconPath: 'M4 4h16v13.17L14.17 22H4V4z M14 17v5 M14 22h6',
  },
  {
    id: 'text_box',
    label: 'Text',
    dbType: 'rectangle',
    defaultWidth: 200,
    defaultHeight: 140,
    overrides: { color: 'transparent', text: '', corner_radius: 0, stroke_color: '#E8E3DA', stroke_dash: '[6,4]' },
    iconPath: 'M4 6h16 M4 6v12h16V6 M8 10h8 M8 14h5',
    autoEdit: true,
  },
  {
    id: 'circle',
    label: 'Circle',
    dbType: 'circle',
    defaultWidth: 120,
    defaultHeight: 120,
    iconPath: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  },
]

export const LINE_PRESETS: ShapePreset[] = [
  {
    id: 'line',
    label: 'Line',
    dbType: 'line',
    defaultWidth: 120,
    defaultHeight: 2,
    iconPath: 'M5 12h14',
  },
  {
    id: 'arrow',
    label: 'Arrow',
    dbType: 'arrow',
    defaultWidth: 120,
    defaultHeight: 40,
    iconPath: 'M5 12h14M12 5l7 7-7 7',
  },
]

/** Placeholder entries for future line types (disabled in UI) */
export const LINE_PLACEHOLDER_PRESETS = [
  { label: 'Curved Line', iconPath: 'M4 20C4 20 8 4 12 12s8-8 8-8' },
  { label: 'Rounded Arrow', iconPath: 'M4 20C4 20 8 4 12 12s8-8 8-8 M16 4l4 4-4 4' },
] as const

export const FRAME_PRESET: ShapePreset = {
  id: 'frame',
  label: 'Frame',
  dbType: 'frame',
  defaultWidth: 400,
  defaultHeight: 300,
  iconPath: 'M3 3h4 M17 3h4v4 M21 17v4h-4 M7 21H3v-4 M3 3v4 M7 21h10 M21 7v10 M3 7v10',
}

export const TABLE_PRESET: ShapePreset = {
  id: 'table',
  label: 'Table',
  dbType: 'table',
  defaultWidth: 360,
  defaultHeight: 128,
  iconPath: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',
}

// ── All shape groups for the menu ────────────────────────────

export const SHAPE_GROUPS: ShapeGroup[] = [
  {
    id: 'triangles',
    label: 'Triangles',
    iconPath: 'M12 2L2 22h20L12 2z',
    presets: TRIANGLE_PRESETS,
  },
  {
    id: 'quads',
    label: 'Quadrilaterals',
    iconPath: 'M3 3h18v18H3z',
    presets: QUAD_PRESETS,
  },
  {
    id: 'symbols',
    label: 'Stars & Shapes',
    iconPath: 'M12 2l2.9 6.3 6.9.8-5 5.1 1.2 6.9L12 17.8 6 21.1l1.2-6.9-5-5.1 6.9-.8z',
    presets: SYMBOL_PRESETS,
  },
  {
    id: 'flowchart',
    label: 'Flowchart',
    iconPath: 'M12 2l10 10-10 10L2 12z',
    presets: FLOWCHART_PRESETS,
  },
]

// scaleCustomPoints is re-exported from @/lib/geometry/customPoints (see top of file).

// ── Agent presets ────────────────────────────────────────────

export const AGENT_PRESETS: ShapePreset[] = [
  { id: 'agent', label: 'Agent', dbType: 'agent', defaultWidth: 200, defaultHeight: 140,
    iconPath: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    overrides: { color: '#F0EBE3', agent_state: 'idle' } },
  { id: 'agent_output', label: 'Output', dbType: 'agent_output', defaultWidth: 240, defaultHeight: 160,
    iconPath: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    overrides: { color: '#EEF5F1' } },
  { id: 'context_object', label: 'Context', dbType: 'context_object', defaultWidth: 180, defaultHeight: 100,
    iconPath: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z',
    overrides: { color: '#FAF8F4' } },
]

// ── Data presets ─────────────────────────────────────────────

export const DATA_PRESETS: ShapePreset[] = [
  { id: 'data_connector', label: 'Data Link', dbType: 'data_connector', defaultWidth: 120, defaultHeight: 2,
    iconPath: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1',
    overrides: { color: '#1E4330', stroke_color: '#1E4330', stroke_width: 2 } },
  { id: 'api_object', label: 'API', dbType: 'api_object', defaultWidth: 180, defaultHeight: 100,
    iconPath: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    overrides: { color: '#F0EBE3' } },
]

// ── Content presets ───────────────────────────────────────────

export const CONTENT_PRESETS: ShapePreset[] = [
  { id: 'text', label: 'Text', dbType: 'text', defaultWidth: 200, defaultHeight: 60,
    iconPath: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
    overrides: { color: 'transparent' }, autoEdit: true },
  { id: 'status_badge', label: 'Status', dbType: 'status_badge', defaultWidth: 100, defaultHeight: 32,
    iconPath: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    overrides: { color: '#22C55E', text: 'Status' } },
  { id: 'section_header', label: 'Section', dbType: 'section_header', defaultWidth: 400, defaultHeight: 40,
    iconPath: 'M4 6h16M4 12h8m-8 6h16',
    overrides: { color: 'transparent', text: 'Section Title' } },
  { id: 'metric_card', label: 'Metric', dbType: 'metric_card', defaultWidth: 160, defaultHeight: 100,
    iconPath: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    overrides: { color: '#FFFFFF', text: '0' } },
  { id: 'checklist', label: 'Checklist', dbType: 'checklist', defaultWidth: 200, defaultHeight: 160,
    iconPath: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
    overrides: { color: '#FFFFFF', text: '\u2610 Item 1\n\u2610 Item 2\n\u2610 Item 3' } },
]
