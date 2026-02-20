/**
 * Shape type defaults — inlined from shapeRegistry + usePersistence manual defaults.
 * The agent container can't import from the Next.js source tree.
 */

export interface ShapeDefaults {
  width: number
  height: number
  color: string
  text?: string
  font_size?: number
  font_family?: string
  font_style?: string
  stroke_width?: number
  corner_radius?: number
}

const SHAPE_DEFAULTS: Record<string, ShapeDefaults> = {
  sticky_note: {
    width: 150, height: 150, color: '#FFEB3B',
    text: '', font_size: 14, font_family: 'sans-serif', font_style: 'normal',
  },
  rectangle: {
    width: 200, height: 140, color: '#2196F3',
    text: '', corner_radius: 6,
  },
  circle: {
    width: 120, height: 120, color: '#4CAF50',
    text: '',
  },
  triangle: {
    width: 100, height: 90, color: '#8B5CF6',
    text: '',
  },
  chevron: {
    width: 100, height: 87, color: '#10B981',
    text: '',
  },
  parallelogram: {
    width: 140, height: 80, color: '#EC4899',
    text: '',
  },
  ngon: {
    width: 120, height: 120, color: '#F97316',
    text: '',
  },
  frame: {
    width: 400, height: 300, color: 'rgba(200,200,200,0.3)',
    text: 'Frame',
  },
  line: {
    width: 120, height: 2, color: '#374151',
    stroke_width: 2,
  },
  arrow: {
    width: 120, height: 40, color: '#F59E0B',
    stroke_width: 2, text: '',
  },
  table: {
    width: 360, height: 128, color: '#FFFFFF',
    text: '',
  },
  file: {
    width: 0, height: 0, color: 'transparent',
    text: '',
  },
}

export function getShapeDefaults(type: string): ShapeDefaults {
  return SHAPE_DEFAULTS[type] ?? SHAPE_DEFAULTS.rectangle
}
