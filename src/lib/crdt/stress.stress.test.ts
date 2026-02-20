/**
 * CRDT stress tests — genuine conflict resolution, commutativity proofs,
 * HLC monotonicity, add-wins semantics, and broadcast coalesce verification.
 *
 * Run via: npm run test:stress
 */
import { describe, it, expect, afterAll } from 'vitest'
import { HLC, createHLC, tickHLC, hlcGreaterThan } from './hlc'
import { mergeFields, mergeClocks, shouldDeleteWin, stampFields, FieldClocks } from './merge'
import { coalesceBroadcastQueue } from '@/hooks/board/useBroadcast'
import type { BoardChange } from '@/hooks/board/useBroadcast'
import { printStressTable, StressMetric } from '@/test/stressTable'

type TestObj = { id: string; x: number; y: number; color: string; z_index: number; text: string }

function makeObj(id: string, overrides?: Partial<TestObj>): TestObj {
  return { id, x: 0, y: 0, color: '#fff', z_index: 0, text: '', ...overrides }
}

function makeClock(ts: number, c: number, n: string): HLC {
  return { ts, c, n }
}

/** Shuffle array in-place using Fisher-Yates */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

/** All permutations of a small array */
function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr]
  const result: T[][] = []
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)]
    for (const perm of permutations(rest)) {
      result.push([arr[i]!, ...perm])
    }
  }
  return result
}

const metrics: StressMetric[] = []

afterAll(() => {
  printStressTable('CRDT Stress Test Results', metrics)
})

describe('CRDT stress: field-level conflict convergence', () => {
  it('100 objects × 10 fields, 3 clients all modifying SAME fields, random order converges', () => {
    const N = 100
    const FIELDS = ['x', 'y', 'color', 'z_index', 'text', 'width', 'height', 'rotation', 'opacity', 'font_size']
    const clients = ['client-a', 'client-b', 'client-c']

    // Create base objects
    const objects = Array.from({ length: N }, (_, i) => makeObj(`obj-${i}`))

    // Each client generates updates to ALL objects on ALL fields (real conflicts!)
    type Op = { id: string; fields: Record<string, unknown>; clocks: FieldClocks }
    const clientOps: Op[][] = [[], [], []]

    let baseTs = 1000
    for (let clientIdx = 0; clientIdx < 3; clientIdx++) {
      for (let i = 0; i < N; i++) {
        baseTs += 1
        // Each client uses different timestamps to create real winner determination
        const clock = makeClock(baseTs + clientIdx * 50, i, clients[clientIdx]!)
        const fields: Record<string, unknown> = {}
        for (const f of FIELDS) {
          fields[f] = `${clients[clientIdx]}-${i}-${f}`
        }
        clientOps[clientIdx]!.push({
          id: `obj-${i}`,
          fields,
          clocks: stampFields(FIELDS, clock),
        })
      }
    }

    const start = performance.now()

    // Determine expected winners: for each object+field, the highest HLC wins
    const expectedWinners = new Map<string, Record<string, unknown>>()
    for (let i = 0; i < N; i++) {
      const id = `obj-${i}`
      const winner: Record<string, unknown> = {}
      for (const f of FIELDS) {
        let bestClock: HLC | null = null
        let bestValue: unknown = null
        for (let c = 0; c < 3; c++) {
          const op = clientOps[c]![i]!
          const clock = op.clocks[f]!
          if (!bestClock || hlcGreaterThan(clock, bestClock)) {
            bestClock = clock
            bestValue = op.fields[f]
          }
        }
        winner[f] = bestValue
      }
      expectedWinners.set(id, winner)
    }

    // Apply all ops in 5 different random orders and verify convergence
    const results: Map<string, Record<string, unknown>>[] = []
    for (let trial = 0; trial < 5; trial++) {
      const allOps = [...clientOps[0]!, ...clientOps[1]!, ...clientOps[2]!]
      shuffle(allOps)

      const objMap = new Map<string, Record<string, unknown>>()
      const clockMap = new Map<string, FieldClocks>()
      for (const obj of objects) {
        objMap.set(obj.id, { ...obj })
        clockMap.set(obj.id, {})
      }

      for (const op of allOps) {
        const existing = objMap.get(op.id)!
        const existingClocks = clockMap.get(op.id) ?? {}
        const { merged, clocks } = mergeFields(existing, existingClocks, op.fields, op.clocks)
        objMap.set(op.id, merged)
        clockMap.set(op.id, clocks)
      }

      results.push(objMap)
    }

    const elapsed = performance.now() - start

    // All 5 orderings must produce identical results
    for (let trial = 1; trial < results.length; trial++) {
      for (let i = 0; i < N; i++) {
        const id = `obj-${i}`
        expect(results[trial]!.get(id)).toEqual(results[0]!.get(id))
      }
    }

    // All results must match the expected winners
    for (let i = 0; i < N; i++) {
      const id = `obj-${i}`
      const actual = results[0]!.get(id)!
      const expected = expectedWinners.get(id)!
      for (const f of FIELDS) {
        expect(actual[f]).toBe(expected[f])
      }
    }

    metrics.push({ name: `Convergence (${N}×${FIELDS.length})`, value: `${elapsed.toFixed(1)}ms`, pass: true })
  })
})

describe('CRDT stress: commutativity proof', () => {
  it('5 updates to same object: all 120 orderings produce identical output', () => {
    const updates: { fields: Record<string, unknown>; clocks: FieldClocks }[] = []
    for (let i = 0; i < 5; i++) {
      const clock = makeClock(1000 + i * 10, i, `node-${i}`)
      updates.push({
        fields: { x: i * 100, color: `#${i}${i}${i}` },
        clocks: stampFields(['x', 'color'], clock),
      })
    }

    const start = performance.now()
    const allPerms = permutations(updates)
    expect(allPerms.length).toBe(120)

    const results: string[] = []
    for (const perm of allPerms) {
      let obj: Record<string, unknown> = { id: 'test', x: 0, y: 0, color: '#000' }
      let clocks: FieldClocks = {}
      for (const update of perm) {
        const result = mergeFields(obj, clocks, update.fields, update.clocks)
        obj = result.merged
        clocks = result.clocks
      }
      results.push(JSON.stringify(obj))
    }

    const elapsed = performance.now() - start

    // Every permutation must produce the same result
    const expected = results[0]!
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBe(expected)
    }

    metrics.push({ name: 'Commutativity (120 perms)', value: `${elapsed.toFixed(1)}ms`, pass: true })
  })
})

describe('CRDT stress: HLC monotonicity', () => {
  it('10,000 tickHLC calls are strictly monotonic', () => {
    const start = performance.now()
    let hlc = createHLC('stress-node')
    let prev = hlc

    for (let i = 0; i < 10_000; i++) {
      hlc = tickHLC(hlc)
      // Strictly greater, not just >=
      expect(hlcGreaterThan(hlc, prev)).toBe(true)
      prev = hlc
    }

    const elapsed = performance.now() - start
    metrics.push({ name: 'HLC monotonic (10K)', value: `${elapsed.toFixed(1)}ms`, pass: true })
  })
})

describe('CRDT stress: add-wins semantics', () => {
  it('field clocks AFTER delete clock → object resurrects (shouldDeleteWin = false)', () => {
    const deleteClock = makeClock(5000, 0, 'deleter')

    // 50 fields with clocks AFTER delete
    const objectClocks: FieldClocks = {}
    for (let i = 0; i < 50; i++) {
      objectClocks[`field_${i}`] = makeClock(5001 + i, 0, 'resurrector')
    }

    expect(shouldDeleteWin(deleteClock, objectClocks)).toBe(false)
    metrics.push({ name: 'Add-wins (50 fields after)', value: 'resurrects', pass: true })
  })

  it('all field clocks BEFORE delete clock → object stays deleted (shouldDeleteWin = true)', () => {
    const deleteClock = makeClock(5000, 0, 'deleter')

    const objectClocks: FieldClocks = {}
    for (let i = 0; i < 50; i++) {
      objectClocks[`field_${i}`] = makeClock(4000 + i, 0, 'original')
    }

    expect(shouldDeleteWin(deleteClock, objectClocks)).toBe(true)
    metrics.push({ name: 'Add-wins (50 fields before)', value: 'deleted', pass: true })
  })

  it('mixed: one field after delete → object resurrects', () => {
    const deleteClock = makeClock(5000, 0, 'deleter')

    const objectClocks: FieldClocks = {}
    for (let i = 0; i < 49; i++) {
      objectClocks[`field_${i}`] = makeClock(4000, 0, 'old')
    }
    // One field is newer than delete
    objectClocks['field_49'] = makeClock(5001, 0, 'late-updater')

    expect(shouldDeleteWin(deleteClock, objectClocks)).toBe(false)
    metrics.push({ name: 'Add-wins (1 field after)', value: 'resurrects', pass: true })
  })
})

describe('Broadcast coalesce: exact verification', () => {
  function create(id: string, fields?: Record<string, unknown>): BoardChange {
    return { action: 'create', object: { id, type: 'rectangle', ...fields } as BoardChange['object'] }
  }
  function update(id: string, fields: Record<string, unknown>): BoardChange {
    return { action: 'update', object: { id, ...fields } as BoardChange['object'] }
  }
  function del(id: string): BoardChange {
    return { action: 'delete', object: { id } as BoardChange['object'] }
  }

  it('10,000 updates to 100 objects coalesces to exactly 100', () => {
    const start = performance.now()
    const changes: BoardChange[] = []
    for (let i = 0; i < 10_000; i++) {
      const objId = `obj-${i % 100}`
      changes.push(update(objId, { x: i, y: i * 2 }))
    }
    const result = coalesceBroadcastQueue(changes)

    const elapsed = performance.now() - start
    const pass = result.length === 100

    expect(result.length).toBe(100)

    // Verify each result has the LAST value
    for (const r of result) {
      const idx = Number(r.object.id.split('-')[1])
      const lastI = idx + 9900 // last write for obj-N is at i = N + 9900
      expect(r.object.x).toBe(lastI)
      expect(r.object.y).toBe(lastI * 2)
    }

    metrics.push({ name: 'Coalesce 10K→100', value: `${elapsed.toFixed(1)}ms`, pass })
  })

  it('create+delete pairs cancel out', () => {
    const changes: BoardChange[] = []
    // 500 create-then-delete pairs should cancel
    for (let i = 0; i < 500; i++) {
      changes.push(create(`cancel-${i}`))
      changes.push(del(`cancel-${i}`))
    }
    // 100 creates that survive
    for (let i = 0; i < 100; i++) {
      changes.push(create(`survive-${i}`))
    }

    const result = coalesceBroadcastQueue(changes)

    expect(result.length).toBe(100)
    for (const r of result) {
      expect(r.object.id.startsWith('survive-')).toBe(true)
      expect(r.action).toBe('create')
    }

    metrics.push({ name: 'Create+delete cancel', value: `500 pairs→0`, pass: true })
  })

  it('update deduplication preserves latest fields per object', () => {
    const changes: BoardChange[] = [
      update('obj-1', { x: 10, y: 20 }),
      update('obj-1', { x: 30 }),          // x overwritten, y preserved from merge
      update('obj-1', { color: '#red' }),    // adds color
      update('obj-2', { x: 100 }),
      update('obj-2', { x: 200, y: 300 }), // x overwritten
    ]

    const result = coalesceBroadcastQueue(changes)

    expect(result.length).toBe(2)
    const obj1 = result.find(r => r.object.id === 'obj-1')!
    const obj2 = result.find(r => r.object.id === 'obj-2')!

    expect(obj1.object.x).toBe(30)
    expect(obj1.object.y).toBe(20)
    expect(obj1.object.color).toBe('#red')
    expect(obj2.object.x).toBe(200)
    expect(obj2.object.y).toBe(300)

    metrics.push({ name: 'Update dedup fields', value: '5→2, correct', pass: true })
  })

  it('clock merging keeps highest HLC per field', () => {
    const lowClock = makeClock(1000, 0, 'a')
    const highClock = makeClock(2000, 0, 'b')

    const changes: BoardChange[] = [
      { ...update('obj-1', { x: 10 }), clocks: { x: lowClock } },
      { ...update('obj-1', { x: 20 }), clocks: { x: highClock } },
    ]

    const result = coalesceBroadcastQueue(changes)
    expect(result.length).toBe(1)
    expect(result[0]!.clocks!.x).toEqual(highClock)

    metrics.push({ name: 'Clock merge highest', value: 'correct', pass: true })
  })

  it('update merges into prior create, preserving create action', () => {
    const changes: BoardChange[] = [
      create('obj-1', { x: 10, y: 20 }),
      update('obj-1', { x: 30, color: '#blue' }),
    ]

    const result = coalesceBroadcastQueue(changes)
    expect(result.length).toBe(1)
    expect(result[0]!.action).toBe('create') // stays as create
    expect(result[0]!.object.x).toBe(30) // updated
    expect(result[0]!.object.y).toBe(20) // preserved from create
    expect(result[0]!.object.color).toBe('#blue') // added by update

    metrics.push({ name: 'Update into create', value: 'correct', pass: true })
  })

  it('standalone delete for unseen ID passes through', () => {
    const changes: BoardChange[] = [
      del('never-created'),
    ]

    const result = coalesceBroadcastQueue(changes)
    expect(result.length).toBe(1)
    expect(result[0]!.action).toBe('delete')
    expect(result[0]!.object.id).toBe('never-created')

    metrics.push({ name: 'Standalone delete', value: 'correct', pass: true })
  })

  it('delete overrides prior update for same object', () => {
    const changes: BoardChange[] = [
      update('obj-1', { x: 10 }),
      update('obj-1', { x: 20 }),
      del('obj-1'), // should replace the update
    ]

    const result = coalesceBroadcastQueue(changes)
    expect(result.length).toBe(1)
    expect(result[0]!.action).toBe('delete')

    metrics.push({ name: 'Delete overrides update', value: 'correct', pass: true })
  })
})

describe('mergeClocks stress', () => {
  it('merging 1000 field clocks keeps highest per field', () => {
    const start = performance.now()
    let combined: FieldClocks = {}
    // Track expected winners manually
    const expectedMax: FieldClocks = {}

    for (let i = 0; i < 1000; i++) {
      const clocks: FieldClocks = {}
      for (let f = 0; f < 10; f++) {
        const fieldName = `field_${(i * 7 + f) % 50}`
        // Deterministic clock: ts increases with i, counter varies
        const clock = makeClock(1000 + i * 5 + f, i % 10, `node-${i % 5}`)
        clocks[fieldName] = clock
        // Track the highest clock per field
        if (!expectedMax[fieldName] || hlcGreaterThan(clock, expectedMax[fieldName]!)) {
          expectedMax[fieldName] = clock
        }
      }
      combined = mergeClocks(combined, clocks)
    }

    const elapsed = performance.now() - start

    // All 50 field slots should have been written at least once
    expect(Object.keys(combined).length).toBe(50)

    // Verify each retained clock matches the expected maximum
    for (const [field, expectedClock] of Object.entries(expectedMax)) {
      expect(combined[field]).toEqual(expectedClock)
    }

    metrics.push({ name: 'mergeClocks (1K×10)', value: `${elapsed.toFixed(1)}ms`, pass: true })
  })
})
