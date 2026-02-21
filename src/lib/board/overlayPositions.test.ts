import { describe, it, expect } from 'vitest'
import { commentBadgePosition, lockBadgePosition } from './overlayPositions'
import type { BoardObject } from '@/types/board'

// Minimal factory — only geometry fields are exercised by these functions.
function makeObj(overrides: Partial<BoardObject> = {}): BoardObject {
  return {
    // Identity
    id: 'test-id',
    board_id: 'board-id',
    type: 'rectangle',
    created_by: 'user-1',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    // Geometry
    x: 100,
    y: 50,
    x2: null,
    y2: null,
    width: 120,
    height: 80,
    rotation: 0,
    // Hierarchy
    z_index: 0,
    parent_id: null,
    // Text
    text: '',
    font_size: 14,
    // Appearance
    color: '#ffffff',
    // Collab
    locked_by: null,
    ...overrides,
  } as BoardObject
}

// ─────────────────────────────────────────────
// commentBadgePosition
// ─────────────────────────────────────────────

describe('commentBadgePosition', () => {
  it('places badge at top-right of rectangular object bounding box', () => {
    const obj = makeObj({ x: 100, y: 50, width: 120, height: 80 })
    const pos = commentBadgePosition(obj)
    // x should be near right edge of shape (x + width)
    expect(pos.x).toBeGreaterThanOrEqual(100 + 120 - 5) // within 5px of right edge
    expect(pos.x).toBeLessThanOrEqual(100 + 120 + 10) // no more than 10px beyond
    // y should be above top edge of shape
    expect(pos.y).toBeLessThan(50)
  })

  it('aligns badge x to right edge of shape bounding box', () => {
    const obj = makeObj({ x: 0, y: 0, width: 200, height: 100 })
    const pos = commentBadgePosition(obj)
    expect(pos.x).toBe(0 + 200 - 2) // x + width - 2
  })

  it('places badge above the top edge of shape', () => {
    const obj = makeObj({ x: 0, y: 0, width: 200, height: 100 })
    const pos = commentBadgePosition(obj)
    expect(pos.y).toBe(0 - 10) // y - 10
  })

  it('uses midpoint for vector types with x2/y2', () => {
    const obj = makeObj({
      type: 'line',
      x: 0,
      y: 0,
      x2: 100,
      y2: 80,
      width: 100,
      height: 80,
    })
    const pos = commentBadgePosition(obj)
    // x midpoint = (0 + 100) / 2 + 8 = 58
    expect(pos.x).toBe(58)
    // y midpoint = (0 + 80) / 2 - 24 = 16
    expect(pos.y).toBe(16)
  })

  it('handles shapes at non-zero origin correctly', () => {
    const obj = makeObj({ x: 300, y: 200, width: 50, height: 60 })
    const pos = commentBadgePosition(obj)
    expect(pos.x).toBe(300 + 50 - 2)
    expect(pos.y).toBe(200 - 10)
  })
})

// ─────────────────────────────────────────────
// lockBadgePosition
// ─────────────────────────────────────────────

describe('lockBadgePosition', () => {
  it('places badge at top-right corner (LockIconOverlay convention)', () => {
    const obj = makeObj({ x: 100, y: 50, width: 120, height: 80 })
    const pos = lockBadgePosition(obj)
    // Matches LockIconOverlay: iconX = obj.x + obj.width - 6, iconY = obj.y - 6
    expect(pos.x).toBe(100 + 120 - 6)
    expect(pos.y).toBe(50 - 6)
  })

  it('uses midpoint for vector types with x2/y2', () => {
    const obj = makeObj({
      type: 'arrow',
      x: 10,
      y: 20,
      x2: 110,
      y2: 120,
      width: 100,
      height: 100,
    })
    const pos = lockBadgePosition(obj)
    // Matches LockIconOverlay: iconX = (x + x2)/2 + 8, iconY = (y + y2)/2 - 20
    expect(pos.x).toBe((10 + 110) / 2 + 8)
    expect(pos.y).toBe((20 + 120) / 2 - 20)
  })

  it('x is near right edge minus 6', () => {
    const obj = makeObj({ x: 0, y: 0, width: 200, height: 100 })
    const pos = lockBadgePosition(obj)
    expect(pos.x).toBe(200 - 6)
  })

  it('y is above top edge minus 6', () => {
    const obj = makeObj({ x: 0, y: 0, width: 200, height: 100 })
    const pos = lockBadgePosition(obj)
    expect(pos.y).toBe(-6)
  })
})
