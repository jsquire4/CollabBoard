import type { BoardObject } from '@/types/board'
import { shapeRegistry } from '@/components/board/shapeRegistry'

// ShapePreset is defined in shapePresets — mirror only what we need here
interface ScalablePreset {
  scalablePoints?: boolean
  defaultWidth: number
  defaultHeight: number
  overrides?: { custom_points?: string | null }
}

/**
 * Scale a preset's custom_points to new dimensions.
 * Returns undefined when scaling is not applicable (no scalablePoints flag,
 * no custom_points override, or parse failure returns the original string).
 */
export function scaleCustomPoints(
  preset: ScalablePreset,
  newWidth: number,
  newHeight: number
): string | undefined {
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
    return preset.overrides.custom_points ?? undefined
  }
}

/**
 * Compute initial vertex points for a shape entering vertex edit mode.
 * Returns flat [x1, y1, x2, y2, ...] relative to the shape's (0, 0) origin.
 */
export function getInitialVertexPoints(obj: BoardObject): number[] {
  // If already has custom points, parse them
  if (obj.custom_points) {
    try {
      return JSON.parse(obj.custom_points)
    } catch { /* fall through */ }
  }

  const w = obj.width
  const h = obj.height
  const def = shapeRegistry.get(obj.type)

  // Polygon shapes: use registry getPoints
  if (def?.strategy === 'polygon' && def.getPoints) {
    return def.getPoints(w, h, obj)
  }

  // Rectangle: 4 corners
  if (def?.strategy === 'rect') {
    return [0, 0, w, 0, w, h, 0, h]
  }

  // Circle: 24-point approximation on the ellipse
  if (def?.strategy === 'circle') {
    const n = 24
    const pts: number[] = []
    const cx = w / 2
    const cy = h / 2
    const rx = w / 2
    const ry = h / 2
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2
      pts.push(cx + rx * Math.cos(angle), cy + ry * Math.sin(angle))
    }
    return pts
  }

  return []
}
