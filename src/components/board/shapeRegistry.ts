import Konva from 'konva'
import { BoardObject } from '@/types/board'

export interface TextInset {
  x: number
  y: number
  width: number
  height: number
}

export type RenderStrategy = 'rect' | 'circle' | 'polygon'

export interface ShapeDefinition {
  strategy: RenderStrategy
  defaultWidth: number
  defaultHeight: number
  defaultColor: string
  defaultOverrides?: Partial<BoardObject>
  /** Polygon strategy: return flat [x1,y1,x2,y2,...] array */
  getPoints?: (w: number, h: number, obj: BoardObject) => number[]
  /** Extra Konva props for the primitive (e.g. cornerRadius) */
  konvaProps?: (obj: BoardObject) => Record<string, unknown>
  /** Text bounding box inset within the shape */
  getTextInset: (w: number, h: number, padding: number) => TextInset
  /** True for circle — uses center-origin positioning for bare (no-text) mode */
  centerOrigin?: boolean
  /** Custom transform handler (circle bare mode needs radius-based transform) */
  handleTransformEnd?: (
    e: Konva.KonvaEventObject<Event>,
    obj: BoardObject,
    callback: (id: string, updates: Partial<BoardObject>) => void
  ) => void
}

export const shapeRegistry = new Map<string, ShapeDefinition>()

// ── Rectangle ──────────────────────────────────────────────
shapeRegistry.set('rectangle', {
  strategy: 'rect',
  defaultWidth: 200,
  defaultHeight: 140,
  defaultColor: '#2196F3',
  defaultOverrides: { text: '' },
  konvaProps: (obj) => ({ cornerRadius: obj.corner_radius ?? 6 }),
  getTextInset: (w, h, padding) => ({
    x: padding,
    y: 0,
    width: w - 2 * padding,
    height: h,
  }),
})

// ── Circle ─────────────────────────────────────────────────
shapeRegistry.set('circle', {
  strategy: 'circle',
  defaultWidth: 120,
  defaultHeight: 120,
  defaultColor: '#4CAF50',
  defaultOverrides: { text: '' },
  centerOrigin: true,
  handleTransformEnd: (e, obj, callback) => {
    const node = e.target as Konva.Circle
    const scaleX = node.scaleX()
    const scaleY = node.scaleY()
    node.scaleX(1)
    node.scaleY(1)
    const newRadius = Math.max(5, node.radius() * Math.sqrt(scaleX * scaleY))
    const newWidth = newRadius * 2
    const newHeight = newRadius * 2
    callback(obj.id, {
      x: node.x() - newRadius,
      y: node.y() - newRadius,
      width: newWidth,
      height: newHeight,
      rotation: node.rotation(),
    })
  },
  getTextInset: (w, h, padding) => {
    const radius = Math.min(w, h) / 2
    const inset = radius * 0.29
    return {
      x: inset + padding,
      y: inset + padding,
      width: Math.max(0, w - 2 * (inset + padding)),
      height: Math.max(0, h - 2 * (inset + padding)),
    }
  },
})

// ── Triangle ───────────────────────────────────────────────
shapeRegistry.set('triangle', {
  strategy: 'polygon',
  defaultWidth: 100,
  defaultHeight: 90,
  defaultColor: '#8B5CF6',
  defaultOverrides: { text: '' },
  getPoints: (w, h, _obj) => [w / 2, 0, w, h, 0, h],
  getTextInset: (w, h, padding) => {
    const textTop = h * 0.4
    const textInsetX = w * 0.2
    return {
      x: textInsetX + padding,
      y: textTop,
      width: Math.max(0, w - 2 * (textInsetX + padding)),
      height: h - textTop - padding,
    }
  },
})

// ── Chevron (hexagon) ──────────────────────────────────────
shapeRegistry.set('chevron', {
  strategy: 'polygon',
  defaultWidth: 100,
  defaultHeight: 87,
  defaultColor: '#10B981',
  defaultOverrides: { text: '' },
  getPoints: (w, h, _obj) => [0, h / 2, w / 4, 0, (3 * w) / 4, 0, w, h / 2, (3 * w) / 4, h, w / 4, h],
  getTextInset: (w, h, padding) => {
    const textInsetX = w * 0.25
    return {
      x: textInsetX + padding,
      y: padding,
      width: Math.max(0, w - 2 * (textInsetX + padding)),
      height: h - 2 * padding,
    }
  },
})

// ── Parallelogram ──────────────────────────────────────────
shapeRegistry.set('parallelogram', {
  strategy: 'polygon',
  defaultWidth: 140,
  defaultHeight: 80,
  defaultColor: '#EC4899',
  defaultOverrides: { text: '' },
  getPoints: (w, h, _obj) => {
    const skew = w * 0.15
    return [skew, 0, w, 0, w - skew, h, 0, h]
  },
  getTextInset: (w, h, padding) => {
    const skew = w * 0.15
    return {
      x: skew + padding,
      y: padding,
      width: Math.max(0, w - 2 * skew - 2 * padding),
      height: h - 2 * padding,
    }
  },
})

// ── N-gon (regular polygon with N sides) ──────────────────
shapeRegistry.set('ngon', {
  strategy: 'polygon',
  defaultWidth: 120,
  defaultHeight: 120,
  defaultColor: '#F97316',
  defaultOverrides: { text: '', sides: 5 },
  getPoints: (w, h, obj) => {
    const n = obj.sides ?? 5
    const points: number[] = []
    const cx = w / 2
    const cy = h / 2
    const rx = w / 2
    const ry = h / 2
    for (let i = 0; i < n; i++) {
      // Start from top (-PI/2) and go clockwise
      const angle = (2 * Math.PI * i) / n - Math.PI / 2
      points.push(cx + rx * Math.cos(angle), cy + ry * Math.sin(angle))
    }
    return points
  },
  getTextInset: (w, h, padding) => {
    // ~30% inset (like circle)
    const insetX = w * 0.2
    const insetY = h * 0.2
    return {
      x: insetX + padding,
      y: insetY + padding,
      width: Math.max(0, w - 2 * (insetX + padding)),
      height: Math.max(0, h - 2 * (insetY + padding)),
    }
  },
})
