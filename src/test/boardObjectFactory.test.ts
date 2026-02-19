import { describe, it, expect, beforeEach } from 'vitest'
import {
  resetFactory,
  makeObject,
  makeRectangle,
  makeCircle,
  makeLine,
  makeArrow,
  makeStickyNote,
  makeGroup,
  makeFrame,
  objectsMap,
} from './boardObjectFactory'

describe('boardObjectFactory', () => {
  beforeEach(() => resetFactory())

  it('resetFactory resets id counter', () => {
    const a = makeObject()
    const b = makeObject()
    expect(a.id).toBe('test-obj-1')
    expect(b.id).toBe('test-obj-2')

    resetFactory()
    const c = makeObject()
    expect(c.id).toBe('test-obj-1')
  })

  it('makeObject uses overrides', () => {
    const obj = makeObject({ id: 'custom', type: 'circle', x: 50 })
    expect(obj.id).toBe('custom')
    expect(obj.type).toBe('circle')
    expect(obj.x).toBe(50)
  })

  it('makeRectangle sets type and dimensions', () => {
    const r = makeRectangle()
    expect(r.type).toBe('rectangle')
    expect(r.width).toBe(120)
    expect(r.height).toBe(80)
  })

  it('makeCircle sets type and dimensions', () => {
    const c = makeCircle()
    expect(c.type).toBe('circle')
    expect(c.width).toBe(100)
    expect(c.height).toBe(100)
  })

  it('makeLine sets vector type with x2/y2', () => {
    const l = makeLine()
    expect(l.type).toBe('line')
    expect(l.x).toBe(50)
    expect(l.y).toBe(50)
    expect(l.x2).toBe(200)
    expect(l.y2).toBe(150)
    expect(l.width).toBe(0)
    expect(l.height).toBe(0)
  })

  it('makeArrow extends makeLine with marker_end', () => {
    const a = makeArrow()
    expect(a.type).toBe('arrow')
    expect(a.marker_end).toBe('arrow')
    expect(a.x2).toBe(200)
  })

  it('makeStickyNote sets sticky defaults', () => {
    const s = makeStickyNote()
    expect(s.type).toBe('sticky_note')
    expect(s.color).toBe('#FDFD96')
    expect(s.text).toBe('Note text')
    expect(s.width).toBe(200)
  })

  it('makeGroup sets group type and transparent color', () => {
    const g = makeGroup()
    expect(g.type).toBe('group')
    expect(g.color).toBe('transparent')
  })

  it('makeFrame sets frame defaults', () => {
    const f = makeFrame()
    expect(f.type).toBe('frame')
    expect(f.width).toBe(400)
    expect(f.height).toBe(300)
    expect(f.title).toBe('Frame')
    expect(f.color).toBe('rgba(200,200,200,0.1)')
  })

  it('objectsMap builds Map from array', () => {
    const r1 = makeRectangle({ id: 'r1' })
    const r2 = makeRectangle({ id: 'r2' })
    const map = objectsMap(r1, r2)

    expect(map.size).toBe(2)
    expect(map.get('r1')).toBe(r1)
    expect(map.get('r2')).toBe(r2)
  })

  it('objectsMap with single object', () => {
    const r = makeRectangle({ id: 'only' })
    const map = objectsMap(r)
    expect(map.size).toBe(1)
    expect(map.get('only')).toBe(r)
  })

  it('objectsMap with empty array', () => {
    const map = objectsMap()
    expect(map.size).toBe(0)
  })
})
