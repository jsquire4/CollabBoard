import { describe, it, expect, beforeEach } from 'vitest'
import { getObjectsInMarquee } from './useMarqueeSelect'
import { makeRectangle, makeLine, makeObject, resetFactory } from '@/test/boardObjectFactory'

describe('getObjectsInMarquee (pure function)', () => {
  beforeEach(() => resetFactory())

  it('returns empty for too-small marquee', () => {
    const rect = makeRectangle({ id: 'r1', x: 50, y: 50 })
    expect(getObjectsInMarquee([rect], { x: 0, y: 0, width: 1, height: 1 }, null)).toEqual([])
    expect(getObjectsInMarquee([rect], { x: 0, y: 0, width: 2, height: 2 }, null)).toEqual([])
  })

  it('selects objects fully inside marquee', () => {
    const rect = makeRectangle({ id: 'r1', x: 50, y: 50, width: 100, height: 80 })
    const result = getObjectsInMarquee([rect], { x: 0, y: 0, width: 200, height: 200 }, null)
    expect(result).toEqual(['r1'])
  })

  it('selects objects partially intersecting marquee', () => {
    const rect = makeRectangle({ id: 'r1', x: 50, y: 50, width: 100, height: 80 })
    // Marquee covers left half of rect
    const result = getObjectsInMarquee([rect], { x: 0, y: 0, width: 80, height: 200 }, null)
    expect(result).toEqual(['r1'])
  })

  it('does not select objects outside marquee', () => {
    const rect = makeRectangle({ id: 'r1', x: 200, y: 200, width: 100, height: 80 })
    const result = getObjectsInMarquee([rect], { x: 0, y: 0, width: 50, height: 50 }, null)
    expect(result).toEqual([])
  })

  it('skips groups', () => {
    const group = makeObject({ id: 'g1', type: 'group', x: 0, y: 0, width: 500, height: 500 })
    const result = getObjectsInMarquee([group], { x: 0, y: 0, width: 500, height: 500 }, null)
    expect(result).toEqual([])
  })

  it('filters by activeGroupId', () => {
    const child = makeRectangle({ id: 'c1', x: 50, y: 50, parent_id: 'g1' })
    const other = makeRectangle({ id: 'r1', x: 50, y: 50, parent_id: null })
    const result = getObjectsInMarquee([child, other], { x: 0, y: 0, width: 200, height: 200 }, 'g1')
    expect(result).toEqual(['c1'])
  })

  it('handles vector types using endpoint-based AABB', () => {
    // Line from (10,10) to (100,100)
    const line = makeLine({ id: 'l1', x: 10, y: 10, x2: 100, y2: 100, width: 0, height: 0 })
    // Marquee covers upper portion — should intersect
    const result = getObjectsInMarquee([line], { x: 0, y: 0, width: 50, height: 50 }, null)
    expect(result).toEqual(['l1'])
  })

  it('handles vector types where x2 < x (reversed direction)', () => {
    const line = makeLine({ id: 'l1', x: 100, y: 100, x2: 10, y2: 10, width: 0, height: 0 })
    // Marquee in upper-left should still intersect
    const result = getObjectsInMarquee([line], { x: 0, y: 0, width: 50, height: 50 }, null)
    expect(result).toEqual(['l1'])
  })

  it('selects multiple objects', () => {
    const r1 = makeRectangle({ id: 'r1', x: 10, y: 10, width: 50, height: 50 })
    const r2 = makeRectangle({ id: 'r2', x: 100, y: 100, width: 50, height: 50 })
    const r3 = makeRectangle({ id: 'r3', x: 500, y: 500, width: 50, height: 50 })
    const result = getObjectsInMarquee([r1, r2, r3], { x: 0, y: 0, width: 200, height: 200 }, null)
    expect(result).toEqual(['r1', 'r2'])
  })
})
