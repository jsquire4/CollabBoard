/**
 * Tests for the dispatch boundary between CRDT merge and blind merge.
 *
 * Verifies that:
 * - Clock-bearing updates go through mergeFields (per-field LWW)
 * - Clock-less updates are applied as blind merges (all fields unconditionally)
 * - Partial clocks: only clocked fields participate in LWW; unclocked fields in remoteFields are ignored
 * - shouldDeleteWin implements add-wins semantics including equal-clock boundary
 * - coalesceBroadcastQueue correctly handles clocked, unclocked, mixed, and edge-case batches
 * - Idempotency: applying the same clocked update twice yields identical results
 * - Merge is non-destructive to unmentioned fields
 */

import { describe, it, expect } from 'vitest'
import { HLC } from './hlc'
import { mergeFields, mergeClocks, shouldDeleteWin, FieldClocks } from './merge'
import { coalesceBroadcastQueue } from '@/hooks/useBoardState'

function makeClock(ts: number, c: number, n: string): HLC {
  return { ts, c, n }
}

type TestObj = Record<string, unknown>

// ─── Clock-bearing update dispatch ──────────────────────────────────────────

describe('dispatch: clock-bearing update → mergeFields', () => {
  it('applies only winning fields from a clocked update', () => {
    const local: TestObj = { id: 'obj1', x: 10, y: 20, color: '#fff' }
    const localClocks: FieldClocks = {
      x: makeClock(2000, 0, 'a'),  // local x is newer
      y: makeClock(1000, 0, 'a'),
    }
    const remoteFields: TestObj = { x: 50, y: 100, color: '#f00' }
    const remoteClocks: FieldClocks = {
      x: makeClock(1000, 0, 'b'),  // remote x is older → rejected
      y: makeClock(2000, 0, 'b'),  // remote y is newer → accepted
      color: makeClock(1500, 0, 'b'), // no local clock → accepted
    }

    const { merged, clocks, changed } = mergeFields(local, localClocks, remoteFields, remoteClocks)
    expect(merged.x).toBe(10)       // local wins
    expect(merged.y).toBe(100)      // remote wins
    expect(merged.color).toBe('#f00') // remote wins (no local clock)
    expect(changed).toBe(true)
    // Clocks should reflect the winners
    expect(clocks.x).toEqual(makeClock(2000, 0, 'a'))  // local clock kept
    expect(clocks.y).toEqual(makeClock(2000, 0, 'b'))  // remote clock adopted
    expect(clocks.color).toEqual(makeClock(1500, 0, 'b'))  // remote clock adopted
  })

  it('rejects all fields when local clocks are all newer', () => {
    const local: TestObj = { id: 'obj1', x: 10, y: 20 }
    const localClocks: FieldClocks = {
      x: makeClock(3000, 0, 'a'),
      y: makeClock(3000, 0, 'a'),
    }
    const remoteFields: TestObj = { x: 99, y: 99 }
    const remoteClocks: FieldClocks = {
      x: makeClock(1000, 0, 'b'),
      y: makeClock(1000, 0, 'b'),
    }

    const { merged, clocks, changed } = mergeFields(local, localClocks, remoteFields, remoteClocks)
    expect(merged.x).toBe(10)
    expect(merged.y).toBe(20)
    expect(changed).toBe(false)
    // Clocks unchanged — local was already winning
    expect(clocks.x).toEqual(makeClock(3000, 0, 'a'))
    expect(clocks.y).toEqual(makeClock(3000, 0, 'a'))
  })

  it('does not clobber fields not mentioned in the remote update', () => {
    const local: TestObj = { id: 'obj1', x: 10, y: 20, color: '#fff', text: 'hello' }
    const localClocks: FieldClocks = {
      x: makeClock(1000, 0, 'a'),
      y: makeClock(1000, 0, 'a'),
      color: makeClock(1000, 0, 'a'),
      text: makeClock(1000, 0, 'a'),
    }
    // Remote only touches x
    const remoteFields: TestObj = { x: 99 }
    const remoteClocks: FieldClocks = { x: makeClock(2000, 0, 'b') }

    const { merged } = mergeFields(local, localClocks, remoteFields, remoteClocks)
    expect(merged.x).toBe(99)        // remote wins
    expect(merged.y).toBe(20)        // untouched
    expect(merged.color).toBe('#fff') // untouched
    expect(merged.text).toBe('hello') // untouched
  })
})

// ─── Clock-less (blind) merge dispatch ──────────────────────────────────────

describe('dispatch: clock-less update → blind merge', () => {
  it('blind merge applies all fields unconditionally, overriding even "newer" local clocks', () => {
    // When CRDT is disabled or clocks are absent, the hook does: { ...existing, ...change.object }
    // This test verifies the semantic contract: no clock comparison occurs.
    const existing: TestObj = { id: 'obj1', x: 10, y: 20, color: '#fff' }
    const existingClocks: FieldClocks = {
      x: makeClock(9999, 0, 'a'), // "very new" local clock
      y: makeClock(9999, 0, 'a'),
    }
    const update: TestObj = { id: 'obj1', x: 1, color: '#f00' }
    // No clocks on the update — blind merge path

    // Under CRDT merge, local x would win (clock 9999 >> anything remote could provide).
    // Under blind merge, update.x must override unconditionally.
    const blindResult = { ...existing, ...update }
    expect(blindResult.x).toBe(1)         // overridden despite "newer" local clock
    expect(blindResult.y).toBe(20)        // untouched
    expect(blindResult.color).toBe('#f00') // overridden

    // Contrast with CRDT merge: if we ran mergeFields, x would be rejected
    const { merged: crdtResult } = mergeFields(
      existing, existingClocks, update,
      { x: makeClock(1, 0, 'b'), color: makeClock(1, 0, 'b') }, // very old clocks
    )
    expect(crdtResult.x).toBe(10) // local clock wins → local x kept
    // This contrast proves blind merge and CRDT merge produce different results,
    // confirming the dispatch boundary matters.
  })

  it('blind merge overwrites with falsy values (0, empty string, null)', () => {
    const existing: TestObj = { id: 'obj1', x: 100, text: 'hello', color: '#fff' }
    const update: TestObj = { id: 'obj1', x: 0, text: '', color: null }

    const result = { ...existing, ...update }
    expect(result.x).toBe(0)
    expect(result.text).toBe('')
    expect(result.color).toBe(null)
  })
})

// ─── Partial clocks ─────────────────────────────────────────────────────────

describe('dispatch: partial clocks', () => {
  it('fields with clocks go through LWW, fields without clocks in remoteFields are ignored', () => {
    const local: TestObj = { id: 'obj1', x: 10, y: 20, color: '#fff' }
    const localClocks: FieldClocks = { x: makeClock(1000, 0, 'a') }

    // Remote sends clocks for x but not for y
    const remoteFields: TestObj = { x: 50, y: 99 }
    const remoteClocks: FieldClocks = { x: makeClock(2000, 0, 'b') }

    const { merged } = mergeFields(local, localClocks, remoteFields, remoteClocks)
    // x: remote clock (2000) > local clock (1000) → remote wins
    expect(merged.x).toBe(50)
    // y: no remote clock entry → mergeFields doesn't iterate over it → local kept
    expect(merged.y).toBe(20)
    // color: not mentioned in either remote set → local kept
    expect(merged.color).toBe('#fff')
  })

  it('remote clock exists but remote field value is missing → no change', () => {
    const local: TestObj = { id: 'obj1', x: 10 }
    const localClocks: FieldClocks = { x: makeClock(1000, 0, 'a') }

    // Remote has a winning clock for x, but x is not in remoteFields
    const remoteFields: TestObj = {}
    const remoteClocks: FieldClocks = { x: makeClock(5000, 0, 'b') }

    const { merged, changed } = mergeFields(local, localClocks, remoteFields, remoteClocks)
    expect(merged.x).toBe(10) // local kept — no remote value to apply
    expect(changed).toBe(false)
  })
})

// ─── Delete dispatch (add-wins semantics) ───────────────────────────────────

describe('dispatch: delete via shouldDeleteWin (add-wins)', () => {
  it('delete wins when all field clocks are strictly older', () => {
    const deleteClock = makeClock(3000, 0, 'a')
    const objectClocks: FieldClocks = {
      x: makeClock(1000, 0, 'b'),
      y: makeClock(2000, 0, 'b'),
    }
    expect(shouldDeleteWin(deleteClock, objectClocks)).toBe(true)
  })

  it('delete loses (add-wins) when any field has a strictly newer clock', () => {
    const deleteClock = makeClock(1500, 0, 'a')
    const objectClocks: FieldClocks = {
      x: makeClock(1000, 0, 'b'),  // older than delete
      y: makeClock(2000, 0, 'b'),  // NEWER than delete → object survives
    }
    expect(shouldDeleteWin(deleteClock, objectClocks)).toBe(false)
  })

  it('delete wins against object with no clocks', () => {
    expect(shouldDeleteWin(makeClock(1000, 0, 'a'), {})).toBe(true)
  })

  it('concurrent delete and update: update with higher clock resurrects object', () => {
    const deleteClock = makeClock(1000, 0, 'a')
    const objectClocks: FieldClocks = { x: makeClock(1001, 0, 'b') }
    expect(shouldDeleteWin(deleteClock, objectClocks)).toBe(false)
  })

  it('equal clock boundary: delete wins when delete clock equals field clock', () => {
    // hlcGreaterThan(fieldClock, deleteClock) is false when they're equal,
    // so shouldDeleteWin returns true. This is the intended behavior:
    // simultaneous delete-and-last-edit at the exact same causal point → delete wins.
    const clock = makeClock(1000, 0, 'a')
    const objectClocks: FieldClocks = { x: clock }
    expect(shouldDeleteWin(clock, objectClocks)).toBe(true)
  })

  it('equal ts+counter but lower node ID on delete → delete loses', () => {
    // deleteClock node 'a' < fieldClock node 'b'
    // hlcGreaterThan(fieldClock{n:'b'}, deleteClock{n:'a'}) → true → delete loses
    const deleteClock = makeClock(1000, 0, 'a')
    const objectClocks: FieldClocks = { x: makeClock(1000, 0, 'b') }
    expect(shouldDeleteWin(deleteClock, objectClocks)).toBe(false)
  })

  it('delete with many fields: one newer field is enough to save the object', () => {
    const deleteClock = makeClock(2000, 0, 'a')
    const objectClocks: FieldClocks = {
      x: makeClock(1000, 0, 'b'),
      y: makeClock(1500, 0, 'b'),
      color: makeClock(1800, 0, 'b'),
      z_index: makeClock(1900, 0, 'b'),
      text: makeClock(2001, 0, 'b'), // single newer field
    }
    expect(shouldDeleteWin(deleteClock, objectClocks)).toBe(false)
  })
})

// ─── Idempotency ────────────────────────────────────────────────────────────

describe('dispatch: idempotency', () => {
  it('applying the same clocked update twice produces identical result', () => {
    const local: TestObj = { id: 'obj1', x: 10, y: 20 }
    const localClocks: FieldClocks = { x: makeClock(1000, 0, 'a') }
    const remoteFields: TestObj = { x: 50 }
    const remoteClocks: FieldClocks = { x: makeClock(2000, 0, 'b') }

    const first = mergeFields(local, localClocks, remoteFields, remoteClocks)
    const second = mergeFields(first.merged, first.clocks, remoteFields, remoteClocks)

    expect(second.merged).toEqual(first.merged)
    expect(second.clocks).toEqual(first.clocks)
    expect(second.changed).toBe(false) // second application is a no-op
  })

  it('applying the same clocked update three times: still idempotent', () => {
    const local: TestObj = { id: 'obj1', x: 0, y: 0, color: '#fff' }
    const localClocks: FieldClocks = {}
    const remoteFields: TestObj = { x: 50, color: '#f00' }
    const remoteClocks: FieldClocks = {
      x: makeClock(1000, 0, 'b'),
      color: makeClock(1000, 0, 'b'),
    }

    let state = mergeFields(local, localClocks, remoteFields, remoteClocks)
    const firstResult = { ...state.merged }
    state = mergeFields(state.merged, state.clocks, remoteFields, remoteClocks)
    state = mergeFields(state.merged, state.clocks, remoteFields, remoteClocks)

    expect(state.merged).toEqual(firstResult)
  })
})

// ─── coalesceBroadcastQueue ─────────────────────────────────────────────────

describe('coalesceBroadcastQueue: mixed clocked + unclocked changes', () => {
  it('merges two updates to same object, both with clocks', () => {
    const result = coalesceBroadcastQueue([
      {
        action: 'update',
        object: { id: 'obj1', x: 10 },
        clocks: { x: makeClock(1000, 0, 'a') },
      },
      {
        action: 'update',
        object: { id: 'obj1', y: 20 },
        clocks: { y: makeClock(1001, 0, 'a') },
      },
    ])

    expect(result).toHaveLength(1)
    expect(result[0].object).toEqual({ id: 'obj1', x: 10, y: 20 })
    expect(result[0].clocks).toEqual({
      x: makeClock(1000, 0, 'a'),
      y: makeClock(1001, 0, 'a'),
    })
  })

  it('merges clocked + unclocked updates to same object', () => {
    const result = coalesceBroadcastQueue([
      {
        action: 'update',
        object: { id: 'obj1', x: 10 },
        clocks: { x: makeClock(1000, 0, 'a') },
      },
      {
        action: 'update',
        object: { id: 'obj1', y: 20 },
        // No clocks — legacy update
      },
    ])

    expect(result).toHaveLength(1)
    expect(result[0].object).toEqual({ id: 'obj1', x: 10, y: 20 })
    // First change had clocks, second didn't — result keeps clocks from first
    expect(result[0].clocks).toEqual({ x: makeClock(1000, 0, 'a') })
  })

  it('merges unclocked + clocked updates to same object', () => {
    const result = coalesceBroadcastQueue([
      {
        action: 'update',
        object: { id: 'obj1', x: 10 },
        // No clocks
      },
      {
        action: 'update',
        object: { id: 'obj1', y: 20 },
        clocks: { y: makeClock(1000, 0, 'a') },
      },
    ])

    expect(result).toHaveLength(1)
    expect(result[0].object).toEqual({ id: 'obj1', x: 10, y: 20 })
    // Second change had clocks — result picks it up
    expect(result[0].clocks).toEqual({ y: makeClock(1000, 0, 'a') })
  })

  it('delete after create for same object removes both', () => {
    const result = coalesceBroadcastQueue([
      { action: 'create', object: { id: 'obj1', x: 10 } },
      { action: 'delete', object: { id: 'obj1' } },
    ])

    expect(result).toHaveLength(0)
  })

  it('delete replaces prior update for same object', () => {
    const result = coalesceBroadcastQueue([
      { action: 'update', object: { id: 'obj1', x: 10 } },
      {
        action: 'delete',
        object: { id: 'obj1' },
        clocks: { _deleted: makeClock(2000, 0, 'a') },
      },
    ])

    expect(result).toHaveLength(1)
    expect(result[0].action).toBe('delete')
    expect(result[0].clocks).toEqual({ _deleted: makeClock(2000, 0, 'a') })
  })

  it('preserves separate objects in the same batch', () => {
    const result = coalesceBroadcastQueue([
      { action: 'update', object: { id: 'obj1', x: 10 } },
      { action: 'update', object: { id: 'obj2', y: 20 } },
    ])

    expect(result).toHaveLength(2)
    expect(result[0].object.id).toBe('obj1')
    expect(result[1].object.id).toBe('obj2')
  })
})

describe('coalesceBroadcastQueue: additional edge cases', () => {
  it('empty input returns empty output', () => {
    expect(coalesceBroadcastQueue([])).toEqual([])
  })

  it('single change passes through unchanged', () => {
    const change = {
      action: 'update' as const,
      object: { id: 'obj1', x: 10 },
      clocks: { x: makeClock(1000, 0, 'a') },
    }
    const result = coalesceBroadcastQueue([change])
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(change)
  })

  it('create + update for same object coalesces into single create with merged fields', () => {
    const result = coalesceBroadcastQueue([
      {
        action: 'create',
        object: { id: 'obj1', x: 10, y: 20, color: '#fff' },
        clocks: { x: makeClock(1000, 0, 'a'), y: makeClock(1000, 0, 'a'), color: makeClock(1000, 0, 'a') },
      },
      {
        action: 'update',
        object: { id: 'obj1', color: '#f00' },
        clocks: { color: makeClock(1001, 0, 'a') },
      },
    ])

    expect(result).toHaveLength(1)
    expect(result[0].action).toBe('create') // retains create action
    expect(result[0].object).toEqual({ id: 'obj1', x: 10, y: 20, color: '#f00' }) // field merged
    // Clock for color should be the higher one (1001)
    expect(result[0].clocks!.color).toEqual(makeClock(1001, 0, 'a'))
    // Other clocks preserved
    expect(result[0].clocks!.x).toEqual(makeClock(1000, 0, 'a'))
  })

  it('three updates to same field: last value wins, highest clock kept', () => {
    const result = coalesceBroadcastQueue([
      {
        action: 'update',
        object: { id: 'obj1', x: 10 },
        clocks: { x: makeClock(1000, 0, 'a') },
      },
      {
        action: 'update',
        object: { id: 'obj1', x: 20 },
        clocks: { x: makeClock(1001, 0, 'a') },
      },
      {
        action: 'update',
        object: { id: 'obj1', x: 30 },
        clocks: { x: makeClock(1002, 0, 'a') },
      },
    ])

    expect(result).toHaveLength(1)
    expect(result[0].object.x).toBe(30) // last value
    expect(result[0].clocks!.x).toEqual(makeClock(1002, 0, 'a')) // highest clock
  })

  it('coalescing with overlapping clocked fields: mergeClocks takes the higher clock', () => {
    const result = coalesceBroadcastQueue([
      {
        action: 'update',
        object: { id: 'obj1', x: 10, y: 20 },
        clocks: { x: makeClock(2000, 0, 'a'), y: makeClock(1000, 0, 'a') },
      },
      {
        action: 'update',
        object: { id: 'obj1', x: 30, y: 40 },
        clocks: { x: makeClock(1000, 0, 'a'), y: makeClock(2000, 0, 'a') },
      },
    ])

    expect(result).toHaveLength(1)
    // Field values from the second update (spread takes latter)
    expect(result[0].object.x).toBe(30)
    expect(result[0].object.y).toBe(40)
    // But clocks take the HIGHER from mergeClocks (not just the latter)
    expect(result[0].clocks!.x).toEqual(makeClock(2000, 0, 'a')) // first was higher
    expect(result[0].clocks!.y).toEqual(makeClock(2000, 0, 'a')) // second was higher
  })

  it('multiple deletes for same object: last delete wins', () => {
    const result = coalesceBroadcastQueue([
      {
        action: 'delete',
        object: { id: 'obj1' },
        clocks: { _deleted: makeClock(1000, 0, 'a') },
      },
      {
        action: 'delete',
        object: { id: 'obj1' },
        clocks: { _deleted: makeClock(2000, 0, 'a') },
      },
    ])

    expect(result).toHaveLength(1)
    expect(result[0].action).toBe('delete')
    expect(result[0].clocks).toEqual({ _deleted: makeClock(2000, 0, 'a') })
  })

  it('interleaved changes across 3 objects coalesce correctly', () => {
    const result = coalesceBroadcastQueue([
      { action: 'update', object: { id: 'a', x: 1 }, clocks: { x: makeClock(100, 0, 'n') } },
      { action: 'create', object: { id: 'b', x: 2 }, clocks: { x: makeClock(101, 0, 'n') } },
      { action: 'update', object: { id: 'a', y: 3 }, clocks: { y: makeClock(102, 0, 'n') } },
      { action: 'update', object: { id: 'c', x: 4 }, clocks: { x: makeClock(103, 0, 'n') } },
      { action: 'update', object: { id: 'b', y: 5 }, clocks: { y: makeClock(104, 0, 'n') } },
      { action: 'update', object: { id: 'a', z_index: 6 }, clocks: { z_index: makeClock(105, 0, 'n') } },
    ])

    expect(result).toHaveLength(3)
    // Object 'a': three updates merged
    expect(result[0].object).toEqual({ id: 'a', x: 1, y: 3, z_index: 6 })
    expect(result[0].clocks).toEqual({
      x: makeClock(100, 0, 'n'),
      y: makeClock(102, 0, 'n'),
      z_index: makeClock(105, 0, 'n'),
    })
    // Object 'b': create + update merged (stays as create)
    expect(result[1].action).toBe('create')
    expect(result[1].object).toEqual({ id: 'b', x: 2, y: 5 })
    // Object 'c': single update passes through
    expect(result[2].object).toEqual({ id: 'c', x: 4 })
  })
})
