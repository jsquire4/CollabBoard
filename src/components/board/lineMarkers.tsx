import React from 'react'
import { Line, Circle as KonvaCircle, Rect as KonvaRect, Group } from 'react-konva'

export type MarkerType = 'none' | 'arrow' | 'arrow_open' | 'circle' | 'circle_open' | 'square' | 'diamond' | 'diamond_open' | 'bar'

export const MARKER_TYPES: MarkerType[] = [
  'none', 'arrow', 'arrow_open', 'circle', 'circle_open', 'square', 'diamond', 'diamond_open', 'bar',
]

export const MARKER_LABELS: Record<MarkerType, string> = {
  none: 'None',
  arrow: 'Arrow',
  arrow_open: 'Open Arrow',
  circle: 'Circle',
  circle_open: 'Open Circle',
  square: 'Square',
  diamond: 'Diamond',
  diamond_open: 'Open Diamond',
  bar: 'Bar',
}

interface MarkerProps {
  type: MarkerType
  x: number
  y: number
  angle: number // radians
  strokeWidth: number
  color: string
  markerKey: string
}

/**
 * Compute the angle (in radians) of the line segment at a given endpoint.
 * For start: angle from first to second point.
 * For end: angle from second-to-last to last point.
 */
export function computeEndpointAngle(
  allPoints: number[],
  endpoint: 'start' | 'end'
): number {
  if (allPoints.length < 4) return 0
  if (endpoint === 'start') {
    return Math.atan2(allPoints[1] - allPoints[3], allPoints[0] - allPoints[2])
  }
  const n = allPoints.length
  return Math.atan2(
    allPoints[n - 1] - allPoints[n - 3],
    allPoints[n - 2] - allPoints[n - 4]
  )
}

/**
 * Render a marker at the specified endpoint position.
 * Returns null for 'none' type.
 */
export function renderMarker({
  type,
  x,
  y,
  angle,
  strokeWidth,
  color,
  markerKey,
}: MarkerProps): React.ReactNode {
  if (type === 'none') return null

  const scale = Math.max(1, strokeWidth / 2)
  const size = 12 * scale

  // Convert angle to degrees for Konva rotation
  const rotDeg = (angle * 180) / Math.PI

  switch (type) {
    case 'arrow':
      return (
        <Line
          key={markerKey}
          x={x}
          y={y}
          points={[-size, -size / 2, 0, 0, -size, size / 2]}
          rotation={rotDeg}
          fill={color}
          stroke={color}
          strokeWidth={strokeWidth}
          closed
          lineCap="round"
          lineJoin="round"
          listening={false}
        />
      )
    case 'arrow_open':
      return (
        <Line
          key={markerKey}
          x={x}
          y={y}
          points={[-size, -size / 2, 0, 0, -size, size / 2]}
          rotation={rotDeg}
          stroke={color}
          strokeWidth={strokeWidth}
          lineCap="round"
          lineJoin="round"
          listening={false}
        />
      )
    case 'circle':
      return (
        <Group key={markerKey} x={x} y={y} rotation={rotDeg} listening={false}>
          <KonvaCircle
            x={-size / 2}
            y={0}
            radius={size / 2}
            fill={color}
            stroke={color}
            strokeWidth={strokeWidth}
            listening={false}
          />
        </Group>
      )
    case 'circle_open':
      return (
        <Group key={markerKey} x={x} y={y} rotation={rotDeg} listening={false}>
          <KonvaCircle
            x={-size / 2}
            y={0}
            radius={size / 2}
            fill="white"
            stroke={color}
            strokeWidth={strokeWidth}
            listening={false}
          />
        </Group>
      )
    case 'square': {
      const half = size / 2
      return (
        <Group key={markerKey} x={x} y={y} rotation={rotDeg} listening={false}>
          <KonvaRect
            x={-size}
            y={-half}
            width={size}
            height={size}
            fill={color}
            stroke={color}
            strokeWidth={strokeWidth}
            listening={false}
          />
        </Group>
      )
    }
    case 'diamond': {
      const half = size / 2
      return (
        <Line
          key={markerKey}
          x={x}
          y={y}
          points={[-size, 0, -half, -half, 0, 0, -half, half]}
          rotation={rotDeg}
          fill={color}
          stroke={color}
          strokeWidth={strokeWidth}
          closed
          listening={false}
        />
      )
    }
    case 'diamond_open': {
      const half = size / 2
      return (
        <Line
          key={markerKey}
          x={x}
          y={y}
          points={[-size, 0, -half, -half, 0, 0, -half, half]}
          rotation={rotDeg}
          fill="white"
          stroke={color}
          strokeWidth={strokeWidth}
          closed
          listening={false}
        />
      )
    }
    case 'bar':
      return (
        <Line
          key={markerKey}
          x={x}
          y={y}
          points={[0, -size / 2, 0, size / 2]}
          rotation={rotDeg}
          stroke={color}
          strokeWidth={strokeWidth * 1.5}
          lineCap="round"
          listening={false}
        />
      )
    default:
      return null
  }
}

/**
 * Render a small marker icon for UI (pure SVG, for use in React DOM).
 */
export function MarkerIcon({ type, size = 20, color = 'currentColor' }: { type: MarkerType; size?: number; color?: string }) {
  const mid = size / 2
  const s = size * 0.35

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" stroke={color} strokeWidth={1.5}>
      {/* Base line */}
      <line x1={2} y1={mid} x2={size - 2} y2={mid} stroke={color} strokeWidth={1.5} />
      {(() => {
        switch (type) {
          case 'none':
            return null
          case 'arrow':
            return <polygon points={`${size - 2},${mid} ${size - 2 - s},${mid - s * 0.6} ${size - 2 - s},${mid + s * 0.6}`} fill={color} stroke="none" />
          case 'arrow_open':
            return <polyline points={`${size - 2 - s},${mid - s * 0.6} ${size - 2},${mid} ${size - 2 - s},${mid + s * 0.6}`} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          case 'circle':
            return <circle cx={size - 2 - s / 2} cy={mid} r={s / 2} fill={color} stroke="none" />
          case 'circle_open':
            return <circle cx={size - 2 - s / 2} cy={mid} r={s / 2} fill="white" stroke={color} strokeWidth={1.5} />
          case 'square':
            return <rect x={size - 2 - s} y={mid - s / 2} width={s} height={s} fill={color} stroke="none" />
          case 'diamond':
            return <polygon points={`${size - 2},${mid} ${size - 2 - s / 2},${mid - s / 2} ${size - 2 - s},${mid} ${size - 2 - s / 2},${mid + s / 2}`} fill={color} stroke="none" />
          case 'diamond_open':
            return <polygon points={`${size - 2},${mid} ${size - 2 - s / 2},${mid - s / 2} ${size - 2 - s},${mid} ${size - 2 - s / 2},${mid + s / 2}`} fill="white" stroke={color} strokeWidth={1.5} />
          case 'bar':
            return <line x1={size - 2} y1={mid - s * 0.7} x2={size - 2} y2={mid + s * 0.7} stroke={color} strokeWidth={2} strokeLinecap="round" />
          default:
            return null
        }
      })()}
    </svg>
  )
}
