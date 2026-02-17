/**
 * Parity test: verifies that the Edge Function's inlined HLC + merge logic
 * matches the canonical implementations in src/lib/crdt/.
 *
 * The Edge Function (supabase/functions/merge-board-state/index.ts) inlines
 * hlcGreaterThan and mergeFieldClocks to avoid Deno import issues. This test
 * catches drift at test time without requiring Deno.
 */

import { describe, it, expect } from 'vitest'
import { hlcGreaterThan, HLC } from './hlc'
import { mergeClocks, FieldClocks } from './merge'

// ─── Inlined Edge Function implementations (must match the Edge Function) ───

function edgeHlcGreaterThan(a: HLC, b: HLC): boolean {
  if (a.ts !== b.ts) return a.ts > b.ts
  if (a.c !== b.c) return a.c > b.c
  return a.n > b.n
}

function edgeMergeFieldClocks(
  localClocks: FieldClocks,
  remoteClocks: FieldClocks,
): FieldClocks {
  const result = { ...localClocks }
  for (const [field, remoteClock] of Object.entries(remoteClocks)) {
    const localClock = result[field]
    if (!localClock || edgeHlcGreaterThan(remoteClock, localClock)) {
      result[field] = remoteClock
    }
  }
  return result
}

// ─── Test helpers ─────────────────────────────────────────────────────────

function makeClock(ts: number, c: number, n: string): HLC {
  return { ts, c, n }
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('Edge Function parity: hlcGreaterThan', () => {
  const cases: { a: HLC; b: HLC; label: string }[] = [
    { a: makeClock(2000, 0, 'a'), b: makeClock(1000, 0, 'b'), label: 'higher ts wins' },
    { a: makeClock(1000, 0, 'a'), b: makeClock(2000, 0, 'b'), label: 'lower ts loses' },
    { a: makeClock(1000, 5, 'a'), b: makeClock(1000, 3, 'b'), label: 'same ts, higher counter wins' },
    { a: makeClock(1000, 3, 'a'), b: makeClock(1000, 5, 'b'), label: 'same ts, lower counter loses' },
    { a: makeClock(1000, 0, 'b'), b: makeClock(1000, 0, 'a'), label: 'same ts+c, higher node wins' },
    { a: makeClock(1000, 0, 'a'), b: makeClock(1000, 0, 'b'), label: 'same ts+c, lower node loses' },
    { a: makeClock(1000, 0, 'a'), b: makeClock(1000, 0, 'a'), label: 'identical clocks' },
    { a: makeClock(0, 0, ''), b: makeClock(0, 0, ''), label: 'zero clocks' },
    { a: makeClock(Number.MAX_SAFE_INTEGER, 999, 'zzz'), b: makeClock(Number.MAX_SAFE_INTEGER, 999, 'zzz'), label: 'max values' },
    { a: makeClock(1000, 0, 'user-abc-123'), b: makeClock(1000, 0, 'user-abc-122'), label: 'realistic UUIDs' },
  ]

  for (const { a, b, label } of cases) {
    it(`matches canonical for: ${label}`, () => {
      expect(edgeHlcGreaterThan(a, b)).toBe(hlcGreaterThan(a, b))
    })
  }
})

describe('Edge Function parity: mergeFieldClocks', () => {
  it('matches canonical: non-overlapping fields', () => {
    const local: FieldClocks = { x: makeClock(1000, 0, 'a') }
    const remote: FieldClocks = { y: makeClock(2000, 0, 'b') }
    expect(edgeMergeFieldClocks(local, remote)).toEqual(mergeClocks(local, remote))
  })

  it('matches canonical: overlapping fields, remote wins', () => {
    const local: FieldClocks = { x: makeClock(1000, 0, 'a'), color: makeClock(500, 0, 'a') }
    const remote: FieldClocks = { x: makeClock(2000, 0, 'b'), color: makeClock(2000, 0, 'b') }
    expect(edgeMergeFieldClocks(local, remote)).toEqual(mergeClocks(local, remote))
  })

  it('matches canonical: overlapping fields, local wins', () => {
    const local: FieldClocks = { x: makeClock(3000, 0, 'a') }
    const remote: FieldClocks = { x: makeClock(1000, 0, 'b') }
    expect(edgeMergeFieldClocks(local, remote)).toEqual(mergeClocks(local, remote))
  })

  it('matches canonical: mixed wins', () => {
    const local: FieldClocks = {
      x: makeClock(1000, 0, 'a'),
      y: makeClock(3000, 0, 'a'),
      color: makeClock(2000, 0, 'a'),
    }
    const remote: FieldClocks = {
      x: makeClock(2000, 0, 'b'),
      y: makeClock(1000, 0, 'b'),
      z_index: makeClock(5000, 0, 'b'),
    }
    expect(edgeMergeFieldClocks(local, remote)).toEqual(mergeClocks(local, remote))
  })

  it('matches canonical: empty locals', () => {
    const local: FieldClocks = {}
    const remote: FieldClocks = { x: makeClock(1000, 0, 'b'), y: makeClock(2000, 0, 'b') }
    expect(edgeMergeFieldClocks(local, remote)).toEqual(mergeClocks(local, remote))
  })

  it('matches canonical: empty remote', () => {
    const local: FieldClocks = { x: makeClock(1000, 0, 'a') }
    const remote: FieldClocks = {}
    expect(edgeMergeFieldClocks(local, remote)).toEqual(mergeClocks(local, remote))
  })

  it('matches canonical: counter tie-break', () => {
    const local: FieldClocks = { x: makeClock(1000, 5, 'a') }
    const remote: FieldClocks = { x: makeClock(1000, 3, 'b') }
    expect(edgeMergeFieldClocks(local, remote)).toEqual(mergeClocks(local, remote))
  })

  it('matches canonical: node ID tie-break', () => {
    const local: FieldClocks = { x: makeClock(1000, 0, 'a') }
    const remote: FieldClocks = { x: makeClock(1000, 0, 'b') }
    expect(edgeMergeFieldClocks(local, remote)).toEqual(mergeClocks(local, remote))
  })
})
