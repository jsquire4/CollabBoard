import { describe, it, expect, beforeEach } from 'vitest'
import { getShapeAnchors, findNearestAnchor } from './anchorPoints'
import { makeRectangle, makeCircle, makeObject, makeLine, resetFactory } from '@/test/boardObjectFactory'

describe('anchorPoints', () => {
  beforeEach(() => resetFactory())

  describe('getShapeAnchors', () => {
    it('returns empty for vector types', () => {
      const line = makeLine()
      expect(getShapeAnchors(line)).toEqual([])
    })

    it('returns empty for groups', () => {
      const group = makeObject({ type: 'group' })
      expect(getShapeAnchors(group)).toEqual([])
    })

    it('returns empty for deleted objects', () => {
      const rect = makeRectangle({ deleted_at: '2026-01-01T00:00:00Z' })
      expect(getShapeAnchors(rect)).toEqual([])
    })

    it('returns center and vertex/midpoint anchors for rectangle', () => {
      const rect = makeRectangle({ id: 'r1', x: 100, y: 100, width: 120, height: 80 })
      const anchors = getShapeAnchors(rect)

      expect(anchors.some(a => a.id === 'center')).toBe(true)
      expect(anchors.some(a => a.id === 'vertex-0')).toBe(true)
      expect(anchors.some(a => a.id === 'midpoint-0')).toBe(true)
      expect(anchors.length).toBeGreaterThan(1)
    })

    it('uses custom_points when present', () => {
      const obj = makeRectangle({
        id: 'r1',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        custom_points: '[0,0,100,0,100,100,0,100]',
      })
      const anchors = getShapeAnchors(obj)
      expect(anchors.some(a => a.id === 'vertex-0')).toBe(true)
      expect(anchors.some(a => a.id === 'center')).toBe(true)
    })

    it('accounts for rotation', () => {
      const rect = makeRectangle({ x: 0, y: 0, width: 100, height: 50, rotation: 90 })
      const anchors = getShapeAnchors(rect)
      expect(anchors.length).toBeGreaterThan(0)
      expect(anchors[0]!.id).toBe('center')
    })
  })

  describe('findNearestAnchor', () => {
    const anchors = [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 100, y: 0 },
      { id: 'c', x: 100, y: 100 },
    ]

    it('returns null when no anchor within range', () => {
      expect(findNearestAnchor(anchors, 500, 500, 10)).toBeNull()
    })

    it('returns nearest anchor within range', () => {
      const result = findNearestAnchor(anchors, 5, 5, 20)
      expect(result).toEqual({ id: 'a', x: 0, y: 0 })
    })

    it('returns anchor exactly at snap distance', () => {
      const result = findNearestAnchor(anchors, 100, 10, 15)
      expect(result?.id).toBe('b')
    })

    it('returns null for empty anchors', () => {
      expect(findNearestAnchor([], 0, 0, 100)).toBeNull()
    })
  })
})
