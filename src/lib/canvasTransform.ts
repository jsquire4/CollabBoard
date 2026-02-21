/**
 * Shared mutable store for the Konva stage transform.
 * Canvas.tsx writes to this on every position/scale change;
 * BoardClient.tsx reads it for coordinate conversions (e.g. file drop).
 */
export const canvasTransform = {
  x: 0,
  y: 0,
  scale: 1,
  /** Container width in CSS pixels */
  width: 0,
  /** Container height in CSS pixels */
  height: 0,
}
