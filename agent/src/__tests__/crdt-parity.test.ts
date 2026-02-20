/**
 * Parity test: verifies that the agent's inlined HLC + merge logic
 * matches the canonical implementations.
 *
 * Mirror of src/lib/crdt/edge-function-parity.test.ts
 */

import { describe, it, expect } from 'vitest'
import { hlcGreaterThan, type HLC } from '../lib/hlc.js'
import { mergeClocks, stampFields, type FieldClocks } from '../lib/crdt.js'

// ── Canonical implementations (copied from src/lib/crdt/) ──

function canonicalHlcGreaterThan(a: HLC, b: HLC): boolean {
  if (a.ts !== b.ts) return a.ts > b.ts
  if (a.c !== b.c) return a.c > b.c
  return a.n > b.n
}

function canonicalMergeClocks(a: FieldClocks, b: FieldClocks): FieldClocks {
  const result = { ...a }
  for (const [field, bClock] of Object.entries(b)) {
    const aClock = result[field]
    if (!aClock || canonicalHlcGreaterThan(bClock, aClock)) {
      result[field] = bClock
    }
  }
  return result
}

// ── Helpers ─────────────────────────────────────────────────

function makeClock(ts: number, c: number, n: string): HLC {
  return { ts, c, n }
}

// ── Tests ───────────────────────────────────────────────────

describe('Agent CRDT parity: hlcGreaterThan', () => {
  const cases: { a: HLC; b: HLC; label: string }[] = [
    { a: makeClock(2000, 0, 'a'), b: makeClock(1000, 0, 'b'), label: 'higher ts wins' },
    { a: makeClock(1000, 0, 'a'), b: makeClock(2000, 0, 'b'), label: 'lower ts loses' },
    { a: makeClock(1000, 5, 'a'), b: makeClock(1000, 3, 'b'), label: 'same ts, higher counter wins' },
    { a: makeClock(1000, 3, 'a'), b: makeClock(1000, 5, 'b'), label: 'same ts, lower counter loses' },
    { a: makeClock(1000, 0, 'b'), b: makeClock(1000, 0, 'a'), label: 'same ts+c, higher node wins' },
    { a: makeClock(1000, 0, 'a'), b: makeClock(1000, 0, 'b'), label: 'same ts+c, lower node loses' },
    { a: makeClock(1000, 0, 'a'), b: makeClock(1000, 0, 'a'), label: 'identical clocks' },
  ]

  for (const { a, b, label } of cases) {
    it(`matches canonical for: ${label}`, () => {
      expect(hlcGreaterThan(a, b)).toBe(canonicalHlcGreaterThan(a, b))
    })
  }
})

describe('Agent CRDT parity: mergeClocks', () => {
  it('matches canonical: non-overlapping fields', () => {
    const a: FieldClocks = { x: makeClock(1000, 0, 'a') }
    const b: FieldClocks = { y: makeClock(2000, 0, 'b') }
    expect(mergeClocks(a, b)).toEqual(canonicalMergeClocks(a, b))
  })

  it('matches canonical: overlapping fields, remote wins', () => {
    const a: FieldClocks = { x: makeClock(1000, 0, 'a'), color: makeClock(500, 0, 'a') }
    const b: FieldClocks = { x: makeClock(2000, 0, 'b'), color: makeClock(2000, 0, 'b') }
    expect(mergeClocks(a, b)).toEqual(canonicalMergeClocks(a, b))
  })

  it('matches canonical: mixed wins', () => {
    const a: FieldClocks = {
      x: makeClock(1000, 0, 'a'),
      y: makeClock(3000, 0, 'a'),
      color: makeClock(2000, 0, 'a'),
    }
    const b: FieldClocks = {
      x: makeClock(2000, 0, 'b'),
      y: makeClock(1000, 0, 'b'),
      z_index: makeClock(5000, 0, 'b'),
    }
    expect(mergeClocks(a, b)).toEqual(canonicalMergeClocks(a, b))
  })
})

describe('Agent CRDT: stampFields', () => {
  it('creates clocks for all specified fields', () => {
    const clock = makeClock(1000, 0, 'agent')
    const clocks = stampFields(['x', 'y', 'color'], clock)
    expect(Object.keys(clocks)).toEqual(['x', 'y', 'color'])
    expect(clocks.x).toEqual(clock)
    expect(clocks.y).toEqual(clock)
    expect(clocks.color).toEqual(clock)
  })
})
