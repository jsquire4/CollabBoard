/**
 * Tests for lineMarkers (computeEndpointAngle, MARKER_TYPES, MARKER_LABELS).
 */
import { describe, it, expect } from 'vitest'
import { computeEndpointAngle, MARKER_TYPES, MARKER_LABELS } from './lineMarkers'

describe('lineMarkers', () => {
  describe('computeEndpointAngle', () => {
    it('returns 0 when fewer than 4 points', () => {
      expect(computeEndpointAngle([0, 0], 'start')).toBe(0)
      expect(computeEndpointAngle([0, 0, 10], 'start')).toBe(0)
    })

    it('computes start angle (formula: atan2(p1-p3, p0-p2) for pts p0,p1,p2,p3)', () => {
      // Points: (0,0) -> (10,0): atan2(0-0, 0-10) = atan2(0,-10) = PI
      const pts = [0, 0, 10, 0]
      expect(computeEndpointAngle(pts, 'start')).toBeCloseTo(Math.PI)
    })

    it('computes end angle from second-to-last to last point', () => {
      const pts = [0, 0, 10, 0]
      expect(computeEndpointAngle(pts, 'end')).toBeCloseTo(0)
    })

    it('computes angle for diagonal line', () => {
      const pts = [0, 0, 10, 10]
      // start: atan2(0-10, 0-10) = atan2(-10,-10) = -3*PI/4
      expect(computeEndpointAngle(pts, 'start')).toBeCloseTo(-3 * Math.PI / 4)
      // end: atan2(10-0, 10-0) = atan2(10,10) = PI/4
      expect(computeEndpointAngle(pts, 'end')).toBeCloseTo(Math.PI / 4)
    })

    it('computes angle for vertical line', () => {
      const pts = [0, 0, 0, 10]
      // start: atan2(0-10, 0-0) = atan2(-10, 0) = -PI/2
      expect(computeEndpointAngle(pts, 'start')).toBeCloseTo(-Math.PI / 2)
    })
  })

  describe('MARKER_TYPES and MARKER_LABELS', () => {
    it('has expected marker types', () => {
      expect(MARKER_TYPES).toContain('none')
      expect(MARKER_TYPES).toContain('arrow')
      expect(MARKER_TYPES).toContain('circle')
    })

    it('has labels for all types', () => {
      for (const t of MARKER_TYPES) {
        expect(MARKER_LABELS[t as keyof typeof MARKER_LABELS]).toBeDefined()
      }
    })
  })
})
