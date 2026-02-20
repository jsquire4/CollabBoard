import { describe, it, expect } from 'vitest'
import { shapeRegistry } from './shapeRegistry'
import { makeRectangle, makeObject } from '@/test/boardObjectFactory'

describe('shapeRegistry', () => {

  const registeredTypes = ['rectangle', 'circle', 'triangle', 'chevron', 'parallelogram', 'ngon']

  it('has expected shape types registered', () => {
    for (const type of registeredTypes) {
      expect(shapeRegistry.has(type)).toBe(true)
    }
  })

  it('rectangle has rect strategy and getTextInset', () => {
    const def = shapeRegistry.get('rectangle')!
    expect(def.strategy).toBe('rect')
    expect(def.defaultWidth).toBe(200)
    expect(def.defaultHeight).toBe(140)
    expect(def.defaultColor).toBe('#5B8DEF')

    const inset = def.getTextInset(200, 140, 8)
    expect(inset).toEqual({ x: 8, y: 0, width: 184, height: 140 })
  })

  it('rectangle konvaProps returns cornerRadius from object', () => {
    const def = shapeRegistry.get('rectangle')!
    const obj = makeRectangle({ corner_radius: 10 })
    expect(def.konvaProps!(obj)).toEqual({ cornerRadius: 10 })
  })

  it('rectangle konvaProps uses default when corner_radius null', () => {
    const def = shapeRegistry.get('rectangle')!
    const obj = makeRectangle({ corner_radius: null })
    expect(def.konvaProps!(obj)).toEqual({ cornerRadius: 6 })
  })

  it('circle has circle strategy and centerOrigin', () => {
    const def = shapeRegistry.get('circle')!
    expect(def.strategy).toBe('circle')
    expect(def.centerOrigin).toBe(true)
    expect(def.defaultWidth).toBe(120)
  })

  it('circle getTextInset computes ellipse inset', () => {
    const def = shapeRegistry.get('circle')!
    const inset = def.getTextInset(100, 100, 4)
    expect(inset.x).toBeGreaterThan(0)
    expect(inset.width).toBeGreaterThan(0)
    expect(inset.height).toBeGreaterThan(0)
  })

  it('triangle has polygon strategy and getPoints', () => {
    const def = shapeRegistry.get('triangle')!
    expect(def.strategy).toBe('polygon')
    expect(def.getPoints!(100, 90, makeObject({ type: 'triangle' }))).toEqual([50, 0, 100, 90, 0, 90])
  })

  it('chevron has polygon strategy with hexagon points', () => {
    const def = shapeRegistry.get('chevron')!
    expect(def.strategy).toBe('polygon')
    const pts = def.getPoints!(100, 87, makeObject({ type: 'chevron' }))
    expect(pts.length).toBe(12)
  })

  it('parallelogram has polygon strategy with skew', () => {
    const def = shapeRegistry.get('parallelogram')!
    const pts = def.getPoints!(140, 80, makeObject({ type: 'parallelogram' }))
    expect(pts).toEqual([21, 0, 140, 0, 119, 80, 0, 80])
  })

  it('ngon getPoints uses sides from object', () => {
    const def = shapeRegistry.get('ngon')!
    const obj = makeObject({ type: 'ngon', sides: 6 })
    const pts = def.getPoints!(120, 120, obj)
    expect(pts.length).toBe(12)
  })

  it('ngon getPoints defaults to 5 sides', () => {
    const def = shapeRegistry.get('ngon')!
    const obj = makeObject({ type: 'ngon' })
    const pts = def.getPoints!(120, 120, obj)
    expect(pts.length).toBe(10)
  })

  it('triangle getTextInset returns valid rect', () => {
    const def = shapeRegistry.get('triangle')!
    const inset = def.getTextInset(100, 90, 4)
    expect(inset.x).toBeGreaterThanOrEqual(0)
    expect(inset.y).toBeGreaterThanOrEqual(0)
    expect(inset.width).toBeGreaterThanOrEqual(0)
    expect(inset.height).toBeGreaterThanOrEqual(0)
  })

  it('chevron getTextInset returns valid rect', () => {
    const def = shapeRegistry.get('chevron')!
    const inset = def.getTextInset(100, 87, 4)
    expect(inset.x).toBeGreaterThanOrEqual(0)
    expect(inset.y).toBeGreaterThanOrEqual(0)
    expect(inset.width).toBeGreaterThanOrEqual(0)
    expect(inset.height).toBeGreaterThanOrEqual(0)
  })

  it('parallelogram getTextInset returns valid rect', () => {
    const def = shapeRegistry.get('parallelogram')!
    const inset = def.getTextInset(140, 80, 4)
    expect(inset.x).toBeGreaterThanOrEqual(0)
    expect(inset.y).toBeGreaterThanOrEqual(0)
    expect(inset.width).toBeGreaterThanOrEqual(0)
    expect(inset.height).toBeGreaterThanOrEqual(0)
  })

  it('ngon getTextInset returns valid rect', () => {
    const def = shapeRegistry.get('ngon')!
    const inset = def.getTextInset(120, 120, 4)
    expect(inset.x).toBeGreaterThanOrEqual(0)
    expect(inset.y).toBeGreaterThanOrEqual(0)
    expect(inset.width).toBeGreaterThanOrEqual(0)
    expect(inset.height).toBeGreaterThanOrEqual(0)
  })

  it('shapeRegistry.has returns false for unregistered types', () => {
    expect(shapeRegistry.has('sticky_note')).toBe(false)
    expect(shapeRegistry.has('frame')).toBe(false)
    expect(shapeRegistry.has('line')).toBe(false)
  })
})
