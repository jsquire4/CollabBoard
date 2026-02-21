/**
 * Geometry-generating functions for custom polygon shapes.
 *
 * Each function accepts a bounding-box width/height and returns a flat
 * [x1, y1, x2, y2, ...] coordinate array suitable for the `custom_points`
 * field on a BoardObject.
 */

// ── Internal helper ───────────────────────────────────────────

/**
 * Sample points along an elliptical arc.
 * Returns flat [x1, y1, ...] coordinates.
 *
 * @param cx         Centre x
 * @param cy         Centre y
 * @param rx         Horizontal radius
 * @param ry         Vertical radius
 * @param startAngle Start angle in radians
 * @param endAngle   End angle in radians
 * @param segments   Number of segments (output has segments+1 points)
 */
export function arcPoints(
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

// ── Flowchart shapes ──────────────────────────────────────────

/**
 * Points for a Document shape: rectangle with a wavy bottom edge.
 */
export function documentPoints(w: number, h: number): number[] {
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

/**
 * Points for a Database/cylinder shape:
 * top ellipse, sides, and bottom ellipse approximated as a polygon.
 */
export function databasePoints(w: number, h: number): number[] {
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

/**
 * Points for a Cloud shape: bumpy outline using overlapping arc segments.
 */
export function cloudPoints(w: number, h: number): number[] {
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

/**
 * Points for a Terminator/pill shape: left semicircle + right semicircle.
 */
export function terminatorPoints(w: number, h: number): number[] {
  const r = h / 2
  const pts: number[] = []
  // Left semicircle
  pts.push(...arcPoints(r, h / 2, r, h / 2, Math.PI / 2, Math.PI * 1.5, 10))
  // Right semicircle
  pts.push(...arcPoints(w - r, h / 2, r, h / 2, -Math.PI / 2, Math.PI / 2, 10))
  return pts
}

/**
 * Points for a Delay shape: flat left edge with a rounded right (D-shape).
 */
export function delayPoints(w: number, h: number): number[] {
  const pts: number[] = [0, 0, w * 0.6, 0]
  // Right arc
  pts.push(...arcPoints(w * 0.6, h / 2, w * 0.4, h / 2, -Math.PI / 2, Math.PI / 2, 12))
  pts.push(w * 0.6, h, 0, h)
  return pts
}

// ── Arrow shapes ──────────────────────────────────────────────

/**
 * Points for a block arrow in the given direction.
 * Shaft is 30% of the cross-dimension; arrowhead starts at 55%.
 *
 * @param dir Direction the arrowhead points
 * @param w   Bounding-box width
 * @param h   Bounding-box height
 */
export function blockArrowPoints(
  dir: 'right' | 'left' | 'up' | 'down',
  w: number,
  h: number
): number[] {
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
