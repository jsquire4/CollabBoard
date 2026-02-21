/**
 * Tests for lib/geometry/bbox
 * objectBBox, selectionBBox, getGroupBoundingBox, isObjectInViewport
 */
import { describe, it, expect } from 'vitest'
import {
  objectBBox,
  selectionBBox,
  getGroupBoundingBox,
  isObjectInViewport,
} from './bbox'
import type { BoardObject } from '@/types/board'

function rect(id: string, x: number, y: number, w: number, h: number): BoardObject {
  return {
    id,
    board_id: 'b1',
    type: 'rectangle',
    x,
    y,
    width: w,
    height: h,
    rotation: 0,
    z_index: 0,
    parent_id: null,
    text: '',
    font_size: 14,
    color: '#fff',
    created_by: 'u1',
    created_at: '',
    updated_at: '',
  } as BoardObject
}

function vector(id: string, x: number, y: number, x2: number, y2: number): BoardObject {
  return {
    id,
    board_id: 'b1',
    type: 'line',
    x,
    y,
    x2,
    y2,
    width: 0,
    height: 0,
    rotation: 0,
    z_index: 0,
    parent_id: null,
    text: '',
    font_size: 14,
    color: '#000',
    created_by: 'u1',
    created_at: '',
    updated_at: '',
  } as BoardObject
}

function groupObj(id: string): BoardObject {
  return { ...rect(id, 0, 0, 1, 1), type: 'group' } as BoardObject
}

function fileObj(id: string): BoardObject {
  return { ...rect(id, 0, 0, 1, 1), type: 'file' } as BoardObject
}

describe('objectBBox', () => {
  it('returns bbox for rect (x,y,w,h)', () => {
    const obj = rect('r1', 10, 20, 50, 30)
    expect(objectBBox(obj)).toEqual({
      minX: 10,
      minY: 20,
      maxX: 60,
      maxY: 50,
    })
  })

  it('returns bbox for vector (x,y,x2,y2)', () => {
    const obj = vector('v1', 100, 50, 20, 80)
    expect(objectBBox(obj)).toEqual({
      minX: 20,
      minY: 50,
      maxX: 100,
      maxY: 80,
    })
  })

  it('handles vector with x2 < x', () => {
    const obj = vector('v2', 50, 10, 10, 30)
    expect(objectBBox(obj)).toEqual({
      minX: 10,
      minY: 10,
      maxX: 50,
      maxY: 30,
    })
  })
})

describe('selectionBBox', () => {
  it('returns null for empty selection', () => {
    const objects = new Map<string, BoardObject>([['r1', rect('r1', 0, 0, 10, 10)]])
    expect(selectionBBox(new Set(), objects)).toBeNull()
  })

  it('returns null when no selected IDs resolve to objects', () => {
    const objects = new Map<string, BoardObject>()
    expect(selectionBBox(new Set(['missing']), objects)).toBeNull()
  })

  it('returns bbox for single object', () => {
    const objects = new Map([['r1', rect('r1', 5, 10, 20, 30)]])
    expect(selectionBBox(new Set(['r1']), objects)).toEqual({
      minX: 5,
      minY: 10,
      maxX: 25,
      maxY: 40,
    })
  })

  it('returns union bbox for multiple objects', () => {
    const objects = new Map([
      ['r1', rect('r1', 0, 0, 10, 10)],
      ['r2', rect('r2', 50, 60, 20, 20)],
    ])
    expect(selectionBBox(new Set(['r1', 'r2']), objects)).toEqual({
      minX: 0,
      minY: 0,
      maxX: 70,
      maxY: 80,
    })
  })

  it('skips missing IDs in selection', () => {
    const objects = new Map([['r1', rect('r1', 10, 10, 5, 5)]])
    expect(selectionBBox(new Set(['r1', 'missing']), objects)).toEqual({
      minX: 10,
      minY: 10,
      maxX: 15,
      maxY: 15,
    })
  })
})

describe('getGroupBoundingBox', () => {
  it('returns null when group has no renderable children', () => {
    const getDescendants = () => []
    expect(getGroupBoundingBox('g1', getDescendants)).toBeNull()
  })

  it('returns null when all children are groups', () => {
    const getDescendants = () => [groupObj('c1'), groupObj('c2')]
    expect(getGroupBoundingBox('g1', getDescendants)).toBeNull()
  })

  it('returns bbox for rect children with 8px padding', () => {
    const getDescendants = () => [
      rect('c1', 10, 20, 30, 40),
      rect('c2', 50, 60, 20, 10),
    ]
    const result = getGroupBoundingBox('g1', getDescendants)
    // c1: (10,20)-(40,60), c2: (50,60)-(70,70) -> union minX=10, minY=20, maxX=70, maxY=70
    // x=10-8=2, y=20-8=12, width=70-10+16=76, height=70-20+16=66
    expect(result).toEqual({ x: 2, y: 12, width: 76, height: 66 })
  })

  it('handles vector children', () => {
    const getDescendants = () => [
      vector('v1', 0, 0, 100, 50),
    ]
    const result = getGroupBoundingBox('g1', getDescendants)
    expect(result).toEqual({
      x: -8, // 0 - 8
      y: -8, // 0 - 8
      width: 116, // 100 - 0 + 16
      height: 66, // 50 - 0 + 16
    })
  })
})

describe('isObjectInViewport', () => {
  const viewport = { left: 0, top: 0, right: 100, bottom: 100 }

  it('returns false for group', () => {
    expect(
      isObjectInViewport(groupObj('g1'), viewport.left, viewport.top, viewport.right, viewport.bottom)
    ).toBe(false)
  })

  it('returns false for file', () => {
    expect(
      isObjectInViewport(fileObj('f1'), viewport.left, viewport.top, viewport.right, viewport.bottom)
    ).toBe(false)
  })

  it('returns true when rect is inside viewport', () => {
    const obj = rect('r1', 10, 20, 30, 40)
    expect(
      isObjectInViewport(obj, viewport.left, viewport.top, viewport.right, viewport.bottom)
    ).toBe(true)
  })

  it('returns true when rect overlaps viewport', () => {
    const obj = rect('r1', 90, 90, 30, 30) // extends to 120, 120
    expect(
      isObjectInViewport(obj, viewport.left, viewport.top, viewport.right, viewport.bottom)
    ).toBe(true)
  })

  it('returns false when rect is outside viewport', () => {
    const obj = rect('r1', 150, 150, 10, 10)
    expect(
      isObjectInViewport(obj, viewport.left, viewport.top, viewport.right, viewport.bottom)
    ).toBe(false)
  })

  it('returns true when vector is inside viewport', () => {
    const obj = vector('v1', 10, 20, 50, 60)
    expect(
      isObjectInViewport(obj, viewport.left, viewport.top, viewport.right, viewport.bottom)
    ).toBe(true)
  })

  it('returns false when vector is outside viewport', () => {
    const obj = vector('v1', 150, 150, 200, 200)
    expect(
      isObjectInViewport(obj, viewport.left, viewport.top, viewport.right, viewport.bottom)
    ).toBe(false)
  })
})
