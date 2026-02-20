/**
 * Compute star polygon vertices.
 * Returns flat [x1, y1, ...] coordinates in a w×h bounding box.
 */
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
