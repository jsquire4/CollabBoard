import { describe, it, expect } from 'vitest'
import { computeStarPoints, scaleCustomPoints, TRIANGLE_PRESETS } from './shapePresets'

describe('shapePresets', () => {
  describe('computeStarPoints', () => {
    it('returns 5-point star with 20 coords (5 outer + 5 inner vertices)', () => {
      const pts = computeStarPoints(5, 100, 100)
      expect(pts.length).toBe(20)
    })

    it('returns points in w×h box', () => {
      const pts = computeStarPoints(5, 100, 80)
      for (let i = 0; i < pts.length; i += 2) {
        expect(pts[i]).toBeGreaterThanOrEqual(0)
        expect(pts[i]).toBeLessThanOrEqual(100)
        expect(pts[i + 1]).toBeGreaterThanOrEqual(0)
        expect(pts[i + 1]).toBeLessThanOrEqual(80)
      }
    })

    it('uses innerRatio for inner points', () => {
      const ptsDefault = computeStarPoints(5, 100, 100)
      const ptsSmall = computeStarPoints(5, 100, 100, 0.2)
      expect(ptsSmall).not.toEqual(ptsDefault)
    })
  })

  describe('scaleCustomPoints', () => {
    it('returns undefined when scalablePoints is false', () => {
      const preset = { ...TRIANGLE_PRESETS[0]!, scalablePoints: false }
      expect(scaleCustomPoints(preset, 200, 180)).toBeUndefined()
    })

    it('returns undefined when no custom_points', () => {
      const preset = { ...TRIANGLE_PRESETS[0]!, scalablePoints: true, overrides: {} }
      expect(scaleCustomPoints(preset, 200, 180)).toBeUndefined()
    })

    it('scales points when scalablePoints and custom_points set', () => {
      const preset = {
        ...TRIANGLE_PRESETS[0]!,
        scalablePoints: true,
        defaultWidth: 100,
        defaultHeight: 90,
        overrides: { custom_points: '[0,0,50,45,100,0]' },
      }
      const result = scaleCustomPoints(preset, 200, 180)
      expect(result).toBeDefined()
      const parsed = JSON.parse(result!)
      expect(parsed[0]).toBe(0)
      expect(parsed[1]).toBe(0)
      expect(parsed[2]).toBe(100)
      expect(parsed[3]).toBe(90)
    })

    it('returns original on parse error', () => {
      const preset = {
        ...TRIANGLE_PRESETS[0]!,
        scalablePoints: true,
        defaultWidth: 100,
        defaultHeight: 90,
        overrides: { custom_points: 'invalid' },
      }
      expect(scaleCustomPoints(preset, 200, 180)).toBe('invalid')
    })
  })
})
