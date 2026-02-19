'use client'

import { useEffect, useRef, useState } from 'react'

// ── Hook interface ──────────────────────────────────────────────────

export interface UseGridBackgroundDeps {
  stagePos: { x: number; y: number }
  stageScale: number
  gridSize: number
  gridSubdivisions: number
  gridStyle: string
  gridVisible: boolean
  canvasColor: string
  gridColor: string
  subdivisionColor: string
  snapToGridEnabled: boolean
}

// ── Pure computation ────────────────────────────────────────────────

/** Blend hex color toward target by factor t (0 = original, 1 = target) */
function blendColors(hex: string, target: string, t: number): string {
  const parse = (h: string) => {
    const c = h.replace('#', '')
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]
  }
  const [r1, g1, b1] = parse(hex)
  const [r2, g2, b2] = parse(target)
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t)
  return `#${mix(r1, r2).toString(16).padStart(2, '0')}${mix(g1, g2).toString(16).padStart(2, '0')}${mix(b1, b2).toString(16).padStart(2, '0')}`
}

export function computeGridStyles({
  stagePos, stageScale,
  gridSize, gridSubdivisions, gridStyle,
  gridVisible, canvasColor, gridColor, subdivisionColor,
  snapToGridEnabled,
}: UseGridBackgroundDeps): React.CSSProperties {
  if (!gridVisible) return {}

  // Fade grid toward canvas color when zoomed out so shapes stay visible.
  // Full strength at scale >= 1, fully faded at scale <= 0.2.
  const zoomFade = Math.min(1, Math.max(0, (stageScale - 0.2) / 0.8))
  const majorAlpha = (snapToGridEnabled ? 0.85 : 0.7) * zoomFade
  const subAlpha = 0.55 * zoomFade

  if (majorAlpha <= 0) return {} // fully faded — skip all patterns

  const majorSize = gridSize * stageScale
  const subSize = (gridSize / gridSubdivisions) * stageScale

  const images: string[] = []
  const sizes: string[] = []
  const positions: string[] = []

  // Blend grid colors toward canvas at low zoom
  const colorFade = 1 - zoomFade
  const fadedGridColor = blendColors(gridColor, canvasColor, colorFade * 0.7)
  const fadedSubColor = blendColors(subdivisionColor, canvasColor, colorFade * 0.7)

  const majorHex = `${fadedGridColor}${Math.round(majorAlpha * 255).toString(16).padStart(2, '0')}`
  const subHex = `${fadedSubColor}${Math.round(subAlpha * 255).toString(16).padStart(2, '0')}`
  // Dot radii scale with zoom so they stay visible but don't overwhelm
  const majorDotR = Math.max(1.5, Math.min(3, 1.5 * stageScale))
  const subDotR = Math.max(1, Math.min(2, 1 * stageScale))

  // Line layers share the standard position; dot layers are offset by
  // -halfTile so the center of each dot tile lands on a line intersection.
  const linePos = `${stagePos.x}px ${stagePos.y}px`
  const majorDotPos = `${stagePos.x - majorSize / 2}px ${stagePos.y - majorSize / 2}px`
  const subDotPos = `${stagePos.x - subSize / 2}px ${stagePos.y - subSize / 2}px`

  const showLines = gridStyle === 'lines' || gridStyle === 'both'
  const showDots = gridStyle === 'dots' || gridStyle === 'both'

  // Subdivision dots go FIRST (behind major dots) so major dots paint on top
  if (gridSubdivisions > 1 && showDots) {
    images.push(
      `radial-gradient(circle, ${subHex} ${subDotR}px, transparent ${subDotR}px)`,
    )
    sizes.push(`${subSize}px ${subSize}px`)
    positions.push(subDotPos)
  }

  // Major dots on top of subdivision dots
  if (showDots) {
    images.push(
      `radial-gradient(circle, ${majorHex} ${majorDotR}px, transparent ${majorDotR}px)`,
    )
    sizes.push(`${majorSize}px ${majorSize}px`)
    positions.push(majorDotPos)
  }

  if (showLines) {
    images.push(
      `linear-gradient(${majorHex} 1px, transparent 1px)`,
      `linear-gradient(90deg, ${majorHex} 1px, transparent 1px)`,
    )
    sizes.push(`${majorSize}px ${majorSize}px`, `${majorSize}px ${majorSize}px`)
    positions.push(linePos, linePos)
  }

  // Subdivision lines (only when subdivisions > 1)
  if (gridSubdivisions > 1 && showLines) {
    images.push(
      `linear-gradient(${subHex} 1px, transparent 1px)`,
      `linear-gradient(90deg, ${subHex} 1px, transparent 1px)`,
    )
    sizes.push(`${subSize}px ${subSize}px`, `${subSize}px ${subSize}px`)
    positions.push(linePos, linePos)
  }

  return {
    backgroundImage: images.join(','),
    backgroundSize: sizes.join(','),
    backgroundPosition: positions.join(','),
  }
}

// ── Hook ────────────────────────────────────────────────────────────

export function useGridBackground(deps: UseGridBackgroundDeps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const updateSize = () => {
      setDimensions({ width: el.clientWidth, height: el.clientHeight })
    }
    updateSize()
    const ro = new ResizeObserver(updateSize)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const gridStyles = computeGridStyles(deps)

  return { containerRef, dimensions, gridStyles }
}
