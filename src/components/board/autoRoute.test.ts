import { describe, it, expect } from 'vitest'
import { computeAutoRoute, snapAngle45, parseWaypoints } from './autoRoute'
import { makeLine, makeRectangle, objectsMap } from '@/test/boardObjectFactory'

describe('autoRoute', () => {
  describe('computeAutoRoute', () => {
    it('returns null when connect_start_id missing', () => {
      const connector = makeLine({ connect_end_id: 'b', connect_start_anchor: 'center', connect_end_anchor: 'center' })
      const objects = objectsMap(makeRectangle({ id: 'b' }))
      expect(computeAutoRoute(connector, objects)).toBeNull()
    })

    it('returns null when connect_end_id missing', () => {
      const connector = makeLine({ connect_start_id: 'a', connect_start_anchor: 'center', connect_end_anchor: 'center' })
      const objects = objectsMap(makeRectangle({ id: 'a' }))
      expect(computeAutoRoute(connector, objects)).toBeNull()
    })

    it('returns null when waypoints exist', () => {
      const connector = makeLine({
        connect_start_id: 'a',
        connect_end_id: 'b',
        connect_start_anchor: 'center',
        connect_end_anchor: 'center',
        waypoints: '[50,50,150,150]',
      })
      const objects = objectsMap(
        makeRectangle({ id: 'a', x: 0, y: 0, width: 100, height: 100 }),
        makeRectangle({ id: 'b', x: 200, y: 200, width: 100, height: 100 })
      )
      expect(computeAutoRoute(connector, objects)).toBeNull()
    })

    it('returns null for self-loop connector', () => {
      const connector = makeLine({
        connect_start_id: 'a',
        connect_end_id: 'a',
        connect_start_anchor: 'center',
        connect_end_anchor: 'center',
      })
      const objects = objectsMap(makeRectangle({ id: 'a' }))
      expect(computeAutoRoute(connector, objects)).toBeNull()
    })

    it('returns null when start shape not in objects', () => {
      const connector = makeLine({
        connect_start_id: 'a',
        connect_end_id: 'b',
        connect_start_anchor: 'center',
        connect_end_anchor: 'center',
      })
      const objects = objectsMap(makeRectangle({ id: 'b' }))
      expect(computeAutoRoute(connector, objects)).toBeNull()
    })

    it('returns null when end shape not in objects', () => {
      const connector = makeLine({
        connect_start_id: 'a',
        connect_end_id: 'b',
        connect_start_anchor: 'center',
        connect_end_anchor: 'center',
      })
      const objects = objectsMap(makeRectangle({ id: 'a' }))
      expect(computeAutoRoute(connector, objects)).toBeNull()
    })

    it('returns null when anchor not found', () => {
      const connector = makeLine({
        connect_start_id: 'a',
        connect_end_id: 'b',
        connect_start_anchor: 'nonexistent',
        connect_end_anchor: 'center',
      })
      const objects = objectsMap(
        makeRectangle({ id: 'a', x: 0, y: 0, width: 100, height: 100 }),
        makeRectangle({ id: 'b', x: 200, y: 0, width: 100, height: 100 })
      )
      expect(computeAutoRoute(connector, objects)).toBeNull()
    })

    it('returns waypoints for two shapes with valid anchors', () => {
      const connector = makeLine({
        connect_start_id: 'a',
        connect_end_id: 'b',
        connect_start_anchor: 'center',
        connect_end_anchor: 'center',
      })
      const objects = objectsMap(
        makeRectangle({ id: 'a', x: 0, y: 0, width: 100, height: 100 }),
        makeRectangle({ id: 'b', x: 300, y: 0, width: 100, height: 100 })
      )
      const waypoints = computeAutoRoute(connector, objects)
      expect(waypoints).not.toBeNull()
      expect(Array.isArray(waypoints)).toBe(true)
      expect(waypoints!.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('snapAngle45', () => {
    it('returns target when distance is 0', () => {
      expect(snapAngle45(10, 10, 10, 10)).toEqual({ x: 10, y: 10 })
    })

    it('snaps to 45-degree increments', () => {
      const result = snapAngle45(0, 0, 100, 50)
      const angle = Math.atan2(result.y, result.x)
      const snapped45 = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)
      expect(Math.abs(angle - snapped45)).toBeLessThan(0.01)
    })

    it('preserves distance from ref', () => {
      const result = snapAngle45(0, 0, 100, 0)
      expect(Math.sqrt(result.x ** 2 + result.y ** 2)).toBeCloseTo(100)
    })
  })

  describe('parseWaypoints', () => {
    it('returns empty for null/undefined', () => {
      expect(parseWaypoints(null)).toEqual([])
      expect(parseWaypoints(undefined)).toEqual([])
    })

    it('returns empty for empty string', () => {
      expect(parseWaypoints('')).toEqual([])
    })

    it('parses valid JSON array', () => {
      expect(parseWaypoints('[10,20,30,40]')).toEqual([10, 20, 30, 40])
    })

    it('returns empty for invalid JSON', () => {
      expect(parseWaypoints('not json')).toEqual([])
    })

    it('returns empty for odd-length array', () => {
      expect(parseWaypoints('[10,20,30]')).toEqual([])
    })

    it('returns empty for array with less than 2 elements', () => {
      expect(parseWaypoints('[10]')).toEqual([])
    })

    it('returns empty for non-array JSON', () => {
      expect(parseWaypoints('{"x":10}')).toEqual([])
    })
  })
})
