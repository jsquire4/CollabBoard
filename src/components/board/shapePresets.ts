import type { BoardObjectType, BoardObject } from '@/types/board'

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

export interface ShapeGroup {
  id: string
  label: string
  /** SVG path for the group button icon (24×24 viewBox) */
  iconPath: string
  presets: ShapePreset[]
}

// ── Helpers ──────────────────────────────────────────────────

/** Compute star polygon vertices. Returns flat [x1,y1,...] in a w×h box. */
export function computeStarPoints(
  numPoints: number,
  w: number,
  h: number,
  innerRatio = 0.4
): number[] {
  const pts: number[] = []
  const cx = w / 2
  const cy = h / 2
  const outerRx = w / 2
  const outerRy = h / 2
  const innerRx = outerRx * innerRatio
  const innerRy = outerRy * innerRatio
  const total = numPoints * 2
  for (let i = 0; i < total; i++) {
    const angle = (Math.PI * 2 * i) / total - Math.PI / 2
    const isOuter = i % 2 === 0
    const rx = isOuter ? outerRx : innerRx
    const ry = isOuter ? outerRy : innerRy
    pts.push(cx + rx * Math.cos(angle), cy + ry * Math.sin(angle))
  }
  return pts
}

/** Generate points for an arc segment, used in flowchart shapes. */
function arcPoints(
  cx: number, cy: number,
  rx: number, ry: number,
  startAngle: number, endAngle: number,
  segments: number
): number[] {
  const pts: number[] = []
  for (let i = 0; i <= segments; i++) {
    const t = startAngle + (endAngle - startAngle) * (i / segments)
    pts.push(cx + rx * Math.cos(t), cy + ry * Math.sin(t))
  }
  return pts
}

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
      color: '#8B5CF6',
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
      color: '#8B5CF6',
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
    overrides: { sides: 4, color: '#F97316' },
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
      color: '#F97316',
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
      color: '#FBBF24',
    },
    scalablePoints: true,
    iconPath,
  }
}

function blockArrowPoints(dir: 'right' | 'left' | 'up' | 'down', w: number, h: number): number[] {
  // Shaft is 40% of cross-dimension, arrowhead is 60%
  const shaft = 0.3
  const headStart = 0.55
  switch (dir) {
    case 'right':
      return [0, h * shaft, w * headStart, h * shaft, w * headStart, 0, w, h / 2, w * headStart, h, w * headStart, h * (1 - shaft), 0, h * (1 - shaft)]
    case 'left':
      return [w, h * shaft, w * (1 - headStart), h * shaft, w * (1 - headStart), 0, 0, h / 2, w * (1 - headStart), h, w * (1 - headStart), h * (1 - shaft), w, h * (1 - shaft)]
    case 'up':
      return [w * shaft, h, w * shaft, h * (1 - headStart), 0, h * (1 - headStart), w / 2, 0, w, h * (1 - headStart), w * (1 - shaft), h * (1 - headStart), w * (1 - shaft), h]
    case 'down':
      return [w * shaft, 0, w * shaft, h * headStart, 0, h * headStart, w / 2, h, w, h * headStart, w * (1 - shaft), h * headStart, w * (1 - shaft), 0]
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
      color: '#EF4444',
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
      color: '#78716C',
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
      color: '#3B82F6',
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
      color: '#3B82F6',
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
      color: '#3B82F6',
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
      color: '#3B82F6',
    },
    scalablePoints: true,
    iconPath: 'M8 2v12H4l8 8 8-8h-4V2z',
  },
]

// ── Flowchart ────────────────────────────────────────────────

function documentPoints(w: number, h: number): number[] {
  // Rectangle with wavy bottom
  const pts: number[] = [0, 0, w, 0, w, h * 0.8]
  // Bottom wave (right to left)
  const segments = 12
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const x = w * (1 - t)
    const wave = Math.sin(t * Math.PI * 2) * h * 0.08
    pts.push(x, h * 0.85 + wave)
  }
  return pts
}

function databasePoints(w: number, h: number): number[] {
  // Cylinder: top ellipse + sides + bottom ellipse
  const pts: number[] = []
  const ellipseH = h * 0.15
  const segs = 12
  // Top ellipse (left to right)
  for (let i = 0; i <= segs; i++) {
    const t = Math.PI + (Math.PI * i) / segs
    pts.push(w / 2 + (w / 2) * Math.cos(t), ellipseH + ellipseH * Math.sin(t))
  }
  // Right side down
  pts.push(w, h - ellipseH)
  // Bottom ellipse (right to left)
  for (let i = 0; i <= segs; i++) {
    const t = (Math.PI * i) / segs
    pts.push(w / 2 + (w / 2) * Math.cos(t), h - ellipseH + ellipseH * Math.sin(t))
  }
  // Left side up
  pts.push(0, ellipseH)
  return pts
}

function cloudPoints(w: number, h: number): number[] {
  // Bumpy cloud outline using overlapping arcs
  const pts: number[] = []
  const bumps = [
    { cx: w * 0.25, cy: h * 0.55, rx: w * 0.25, ry: h * 0.35, start: Math.PI * 0.9, end: Math.PI * 2.1 },
    { cx: w * 0.50, cy: h * 0.30, rx: w * 0.28, ry: h * 0.30, start: Math.PI * 1.2, end: Math.PI * 2.4 },
    { cx: w * 0.75, cy: h * 0.45, rx: w * 0.25, ry: h * 0.32, start: Math.PI * 1.5, end: Math.PI * 2.7 },
    { cx: w * 0.65, cy: h * 0.72, rx: w * 0.22, ry: h * 0.28, start: 0, end: Math.PI * 0.8 },
    { cx: w * 0.35, cy: h * 0.75, rx: w * 0.24, ry: h * 0.25, start: Math.PI * 0.1, end: Math.PI * 1.0 },
  ]
  for (const b of bumps) {
    pts.push(...arcPoints(b.cx, b.cy, b.rx, b.ry, b.start, b.end, 8))
  }
  return pts
}

function terminatorPoints(w: number, h: number): number[] {
  // Pill / stadium shape
  const r = h / 2
  const pts: number[] = []
  // Left semicircle
  pts.push(...arcPoints(r, h / 2, r, h / 2, Math.PI / 2, Math.PI * 1.5, 10))
  // Right semicircle
  pts.push(...arcPoints(w - r, h / 2, r, h / 2, -Math.PI / 2, Math.PI / 2, 10))
  return pts
}

function delayPoints(w: number, h: number): number[] {
  // D-shape: flat left, rounded right
  const pts: number[] = [0, 0, w * 0.6, 0]
  // Right arc
  pts.push(...arcPoints(w * 0.6, h / 2, w * 0.4, h / 2, -Math.PI / 2, Math.PI / 2, 12))
  pts.push(w * 0.6, h, 0, h)
  return pts
}

export const FLOWCHART_PRESETS: ShapePreset[] = [
  {
    id: 'document',
    label: 'Document',
    dbType: 'ngon',
    defaultWidth: 140,
    defaultHeight: 100,
    overrides: {
      custom_points: pts(documentPoints(140, 100)),
      color: '#60A5FA',
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
      color: '#A78BFA',
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
      color: '#93C5FD',
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
      color: '#34D399',
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
      color: '#FBBF24',
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
      color: '#F472B6',
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
    overrides: { color: 'transparent', text: '', corner_radius: 0, stroke_color: '#94a3b8', stroke_dash: '[6,4]' },
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

export const FRAME_PRESET: ShapePreset = {
  id: 'frame',
  label: 'Frame',
  dbType: 'frame',
  defaultWidth: 400,
  defaultHeight: 300,
  iconPath: 'M3 3h4 M17 3h4v4 M21 17v4h-4 M7 21H3v-4 M3 3v4 M7 21h10 M21 7v10 M3 7v10',
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

// ── Utility: scale custom_points for draw-to-create ──────────

export function scaleCustomPoints(preset: ShapePreset, newWidth: number, newHeight: number): string | undefined {
  if (!preset.scalablePoints || !preset.overrides?.custom_points) return undefined
  try {
    const originalPts: number[] = JSON.parse(preset.overrides.custom_points)
    const scaleX = newWidth / preset.defaultWidth
    const scaleY = newHeight / preset.defaultHeight
    const scaled = originalPts.map((v, i) => {
      const rounded = i % 2 === 0 ? v * scaleX : v * scaleY
      return Math.round(rounded * 100) / 100
    })
    return JSON.stringify(scaled)
  } catch {
    return preset.overrides.custom_points
  }
}
