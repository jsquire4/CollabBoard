import { describe, it, expect } from 'vitest'
import { HLC, tickHLC, createHLC } from './hlc'
import { mergeFields, mergeClocks, stampFields, shouldDeleteWin, FieldClocks } from './merge'

// Helper: create a simple test object
type TestObj = { id: string; x: number; y: number; color: string; z_index: number; text: string; rich_text?: string }

function makeObj(overrides?: Partial<TestObj>): TestObj {
  return { id: 'obj1', x: 0, y: 0, color: '#fff', z_index: 1, text: '', ...overrides }
}

function makeClock(ts: number, c: number, n: string): HLC {
  return { ts, c, n }
}

describe('mergeFields', () => {
  it('remote wins when no local clock exists for a field', () => {
    const local = makeObj({ x: 10, color: '#fff' })
    const localClocks: FieldClocks = {}
    const remoteFields = { color: '#f00' }
    const remoteClocks: FieldClocks = { color: makeClock(1000, 0, 'b') }

    const { merged, clocks, changed } = mergeFields(local, localClocks, remoteFields, remoteClocks)
    expect(merged.color).toBe('#f00')
    expect(clocks.color).toEqual(makeClock(1000, 0, 'b'))
    expect(changed).toBe(true)
    // x should be untouched
    expect(merged.x).toBe(10)
  })

  it('remote wins when remote clock is greater', () => {
    const local = makeObj({ x: 10 })
    const localClocks: FieldClocks = { x: makeClock(1000, 0, 'a') }
    const remoteFields = { x: 50 }
    const remoteClocks: FieldClocks = { x: makeClock(2000, 0, 'b') }

    const { merged, changed } = mergeFields(local, localClocks, remoteFields, remoteClocks)
    expect(merged.x).toBe(50)
    expect(changed).toBe(true)
  })

  it('local wins when local clock is greater', () => {
    const local = makeObj({ x: 10 })
    const localClocks: FieldClocks = { x: makeClock(2000, 0, 'a') }
    const remoteFields = { x: 50 }
    const remoteClocks: FieldClocks = { x: makeClock(1000, 0, 'b') }

    const { merged, changed } = mergeFields(local, localClocks, remoteFields, remoteClocks)
    expect(merged.x).toBe(10)
    expect(changed).toBe(false)
  })

  it('concurrent edits to different fields — both survive', () => {
    const local = makeObj({ x: 100, y: 200, color: '#fff' })
    const localClocks: FieldClocks = {
      x: makeClock(1000, 0, 'a'),
      y: makeClock(1000, 0, 'a'),
    }
    const remoteFields = { color: '#f00' }
    const remoteClocks: FieldClocks = { color: makeClock(1000, 0, 'b') }

    const { merged } = mergeFields(local, localClocks, remoteFields, remoteClocks)
    expect(merged.x).toBe(100)   // local kept
    expect(merged.y).toBe(200)   // local kept
    expect(merged.color).toBe('#f00') // remote applied
  })

  it('tie-break by node ID when ts and counter are identical', () => {
    const local = makeObj({ x: 10 })
    const localClocks: FieldClocks = { x: makeClock(1000, 0, 'a') }
    const remoteFields = { x: 50 }
    const remoteClocks: FieldClocks = { x: makeClock(1000, 0, 'b') }

    // 'b' > 'a' → remote wins
    const { merged } = mergeFields(local, localClocks, remoteFields, remoteClocks)
    expect(merged.x).toBe(50)
  })

  it('returns changed=false when nothing changed', () => {
    const local = makeObj({ x: 10 })
    const localClocks: FieldClocks = { x: makeClock(2000, 0, 'a') }
    const remoteFields = { x: 50 }
    const remoteClocks: FieldClocks = { x: makeClock(1000, 0, 'b') }

    const { changed } = mergeFields(local, localClocks, remoteFields, remoteClocks)
    expect(changed).toBe(false)
  })

  it('handles remote clock for a field not in remoteFields (no-op)', () => {
    const local = makeObj({ x: 10 })
    const localClocks: FieldClocks = {}
    const remoteFields: Partial<TestObj> = {} // no fields
    const remoteClocks: FieldClocks = { x: makeClock(5000, 0, 'b') }

    const { merged, changed } = mergeFields(local, localClocks, remoteFields, remoteClocks)
    expect(merged.x).toBe(10)
    expect(changed).toBe(false)
  })
})

describe('mergeClocks', () => {
  it('takes the higher clock for each field', () => {
    const a: FieldClocks = {
      x: makeClock(1000, 0, 'a'),
      color: makeClock(2000, 0, 'a'),
    }
    const b: FieldClocks = {
      x: makeClock(1500, 0, 'b'),
      y: makeClock(1000, 0, 'b'),
    }
    const result = mergeClocks(a, b)
    expect(result.x).toEqual(makeClock(1500, 0, 'b'))  // b wins
    expect(result.color).toEqual(makeClock(2000, 0, 'a'))  // a kept
    expect(result.y).toEqual(makeClock(1000, 0, 'b'))  // new from b
  })
})

describe('stampFields', () => {
  it('creates clocks for all specified fields', () => {
    const clock: HLC = { ts: 1000, c: 0, n: 'a' }
    const result = stampFields(['x', 'y', 'color'], clock)
    expect(result).toEqual({
      x: clock,
      y: clock,
      color: clock,
    })
  })
})

describe('shouldDeleteWin (add-wins semantics)', () => {
  it('delete wins when delete clock >= all field clocks', () => {
    const deleteClock = makeClock(2000, 0, 'a')
    const objectClocks: FieldClocks = {
      x: makeClock(1000, 0, 'b'),
      y: makeClock(1500, 0, 'b'),
    }
    expect(shouldDeleteWin(deleteClock, objectClocks)).toBe(true)
  })

  it('delete loses when any field clock is newer (add-wins)', () => {
    const deleteClock = makeClock(1500, 0, 'a')
    const objectClocks: FieldClocks = {
      x: makeClock(1000, 0, 'b'),
      y: makeClock(2000, 0, 'b'),  // newer than delete
    }
    expect(shouldDeleteWin(deleteClock, objectClocks)).toBe(false)
  })

  it('delete wins against empty clocks', () => {
    const deleteClock = makeClock(1000, 0, 'a')
    expect(shouldDeleteWin(deleteClock, {})).toBe(true)
  })
})

// ============================================================
// Convergence (commutativity) tests
// ============================================================

describe('convergence', () => {
  // Simulate applying a change to a state
  function applyChange(
    obj: TestObj,
    clocks: FieldClocks,
    remoteFields: Partial<TestObj>,
    remoteClocks: FieldClocks,
  ): { obj: TestObj; clocks: FieldClocks } {
    const { merged, clocks: newClocks } = mergeFields(obj, clocks, remoteFields, remoteClocks)
    return { obj: merged, clocks: newClocks }
  }

  it('Shape 1: reorder delivery — same operations in different order produce same state', () => {
    const base = makeObj({ x: 0, y: 0, color: '#fff', z_index: 1 })

    const ops: { fields: Partial<TestObj>; clocks: FieldClocks }[] = [
      { fields: { x: 100 }, clocks: { x: makeClock(1000, 0, 'a') } },
      { fields: { color: '#f00' }, clocks: { color: makeClock(1001, 0, 'b') } },
      { fields: { x: 200 }, clocks: { x: makeClock(1002, 0, 'a') } },
      { fields: { y: 50 }, clocks: { y: makeClock(1003, 0, 'b') } },
      { fields: { color: '#0f0' }, clocks: { color: makeClock(1000, 1, 'a') } }, // older clock for color
      { fields: { z_index: 10 }, clocks: { z_index: makeClock(1004, 0, 'a') } },
    ]

    // Forward order
    let stateA = { obj: { ...base }, clocks: {} as FieldClocks }
    for (const op of ops) {
      stateA = applyChange(stateA.obj, stateA.clocks, op.fields, op.clocks)
    }

    // Reverse order
    let stateB = { obj: { ...base }, clocks: {} as FieldClocks }
    for (const op of [...ops].reverse()) {
      stateB = applyChange(stateB.obj, stateB.clocks, op.fields, op.clocks)
    }

    // Shuffled order
    const shuffled = [ops[3], ops[0], ops[5], ops[2], ops[4], ops[1]]
    let stateC = { obj: { ...base }, clocks: {} as FieldClocks }
    for (const op of shuffled) {
      stateC = applyChange(stateC.obj, stateC.clocks, op.fields, op.clocks)
    }

    expect(stateA.obj).toEqual(stateB.obj)
    expect(stateA.obj).toEqual(stateC.obj)
    expect(stateA.clocks).toEqual(stateB.clocks)
    expect(stateA.clocks).toEqual(stateC.clocks)
  })

  it('Shape 2: independent divergence then cross-sync produces identical state', () => {
    const base = makeObj({ x: 0, y: 0, color: '#fff', z_index: 1 })
    const baseClocks: FieldClocks = {}

    // Client A makes local edits
    const opsA: { fields: Partial<TestObj>; clocks: FieldClocks }[] = [
      { fields: { x: 100 }, clocks: { x: makeClock(1000, 0, 'a') } },
      { fields: { x: 150 }, clocks: { x: makeClock(1001, 0, 'a') } },
      { fields: { z_index: 5 }, clocks: { z_index: makeClock(1002, 0, 'a') } },
    ]

    // Client B makes independent local edits
    const opsB: { fields: Partial<TestObj>; clocks: FieldClocks }[] = [
      { fields: { color: '#f00' }, clocks: { color: makeClock(1000, 0, 'b') } },
      { fields: { y: 200 }, clocks: { y: makeClock(1001, 0, 'b') } },
      { fields: { x: 50 }, clocks: { x: makeClock(1000, 1, 'b') } }, // concurrent x edit, lower clock than A's final x
    ]

    // Client A applies its own ops locally
    let stateA = { obj: { ...base }, clocks: { ...baseClocks } }
    for (const op of opsA) {
      stateA = applyChange(stateA.obj, stateA.clocks, op.fields, op.clocks)
    }

    // Client B applies its own ops locally
    let stateB = { obj: { ...base }, clocks: { ...baseClocks } }
    for (const op of opsB) {
      stateB = applyChange(stateB.obj, stateB.clocks, op.fields, op.clocks)
    }

    // Verify they've diverged
    expect(stateA.obj).not.toEqual(stateB.obj)

    // Now cross-sync: A receives B's ops, B receives A's ops
    let finalA = { ...stateA }
    for (const op of opsB) {
      finalA = applyChange(finalA.obj, finalA.clocks, op.fields, op.clocks)
    }

    let finalB = { ...stateB }
    for (const op of opsA) {
      finalB = applyChange(finalB.obj, finalB.clocks, op.fields, op.clocks)
    }

    // Both must converge to identical state
    expect(finalA.obj).toEqual(finalB.obj)
    expect(finalA.clocks).toEqual(finalB.clocks)

    // Verify specific field resolution:
    // x: A's final (1001,0,'a') > B's (1000,1,'b') → A wins with x=150
    expect(finalA.obj.x).toBe(150)
    // y: only B touched it → B wins with y=200
    expect(finalA.obj.y).toBe(200)
    // color: only B touched it → B wins with color=#f00
    expect(finalA.obj.color).toBe('#f00')
    // z_index: only A touched it → A wins with z_index=5
    expect(finalA.obj.z_index).toBe(5)
  })

  it('Shape 2: cross-sync in reverse delivery order still converges', () => {
    const base = makeObj({ x: 0, y: 0, color: '#fff' })

    const opsA: { fields: Partial<TestObj>; clocks: FieldClocks }[] = [
      { fields: { x: 100 }, clocks: { x: makeClock(1000, 0, 'a') } },
      { fields: { x: 200 }, clocks: { x: makeClock(1002, 0, 'a') } },
    ]
    const opsB: { fields: Partial<TestObj>; clocks: FieldClocks }[] = [
      { fields: { x: 50 }, clocks: { x: makeClock(1001, 0, 'b') } },
      { fields: { color: '#f00' }, clocks: { color: makeClock(1003, 0, 'b') } },
    ]

    // A applies own ops, then receives B's in forward order
    let stateA1 = { obj: { ...base }, clocks: {} as FieldClocks }
    for (const op of opsA) stateA1 = applyChange(stateA1.obj, stateA1.clocks, op.fields, op.clocks)
    for (const op of opsB) stateA1 = applyChange(stateA1.obj, stateA1.clocks, op.fields, op.clocks)

    // A applies own ops, then receives B's in reverse order
    let stateA2 = { obj: { ...base }, clocks: {} as FieldClocks }
    for (const op of opsA) stateA2 = applyChange(stateA2.obj, stateA2.clocks, op.fields, op.clocks)
    for (const op of [...opsB].reverse()) stateA2 = applyChange(stateA2.obj, stateA2.clocks, op.fields, op.clocks)

    // B applies own ops, then receives A's in forward order
    let stateB1 = { obj: { ...base }, clocks: {} as FieldClocks }
    for (const op of opsB) stateB1 = applyChange(stateB1.obj, stateB1.clocks, op.fields, op.clocks)
    for (const op of opsA) stateB1 = applyChange(stateB1.obj, stateB1.clocks, op.fields, op.clocks)

    // B applies own ops, then receives A's in reverse order
    let stateB2 = { obj: { ...base }, clocks: {} as FieldClocks }
    for (const op of opsB) stateB2 = applyChange(stateB2.obj, stateB2.clocks, op.fields, op.clocks)
    for (const op of [...opsA].reverse()) stateB2 = applyChange(stateB2.obj, stateB2.clocks, op.fields, op.clocks)

    // All four must be identical
    expect(stateA1.obj).toEqual(stateA2.obj)
    expect(stateA1.obj).toEqual(stateB1.obj)
    expect(stateA1.obj).toEqual(stateB2.obj)
  })

  it('Shape 2: 3 clients, 50 operations, cross-sync all pairs', () => {
    const base = makeObj({ x: 0, y: 0, color: '#fff', z_index: 0, text: '' })
    const fields: (keyof TestObj)[] = ['x', 'y', 'color', 'z_index', 'text']
    const colors = ['#f00', '#0f0', '#00f', '#ff0', '#0ff']
    const nodes = ['client-a', 'client-b', 'client-c']

    // Generate ops for each client
    const allOps: { fields: Partial<TestObj>; clocks: FieldClocks }[][] = [[], [], []]
    let ts = 1000

    for (let i = 0; i < 50; i++) {
      const clientIdx = i % 3
      const field = fields[i % fields.length]
      ts += Math.floor(Math.random() * 3) // sometimes same ts (tests counter tie-breaking)
      const clock = makeClock(ts, i, nodes[clientIdx])

      let value: unknown
      if (field === 'x' || field === 'y' || field === 'z_index') value = i * 10
      else if (field === 'color') value = colors[i % colors.length]
      else value = `text-${i}`

      allOps[clientIdx].push({
        fields: { [field]: value } as Partial<TestObj>,
        clocks: { [field]: clock },
      })
    }

    // Each client applies own ops
    const localStates = nodes.map((_, idx) => {
      let state = { obj: { ...base }, clocks: {} as FieldClocks }
      for (const op of allOps[idx]) {
        state = applyChange(state.obj, state.clocks, op.fields, op.clocks)
      }
      return state
    })

    // Cross-sync: each client receives all other clients' ops
    const finalStates = localStates.map((state, idx) => {
      let s = { ...state }
      for (let other = 0; other < 3; other++) {
        if (other === idx) continue
        for (const op of allOps[other]) {
          s = applyChange(s.obj, s.clocks, op.fields, op.clocks)
        }
      }
      return s
    })

    // All three must converge
    expect(finalStates[0].obj).toEqual(finalStates[1].obj)
    expect(finalStates[0].obj).toEqual(finalStates[2].obj)
    expect(finalStates[0].clocks).toEqual(finalStates[1].clocks)
    expect(finalStates[0].clocks).toEqual(finalStates[2].clocks)
  })

  it('delete on Client A, update on Client B — add-wins resurrects object', () => {
    const deleteClock = makeClock(1000, 0, 'a')
    const updateClocks: FieldClocks = {
      x: makeClock(1001, 0, 'b'), // newer than delete
    }

    // Delete should NOT win because update has a newer field clock
    expect(shouldDeleteWin(deleteClock, updateClocks)).toBe(false)
  })

  it('rich_text merges as atomic blob via LWW', () => {
    const local = makeObj({ text: 'old' })
    const localClocks: FieldClocks = {
      text: makeClock(1000, 0, 'a'),
    }
    const richTextJson = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"bold","marks":[{"type":"bold"}]}]}]}'
    const remoteFields = { rich_text: richTextJson, text: 'bold' }
    const remoteClocks: FieldClocks = {
      rich_text: makeClock(2000, 0, 'b'),
      text: makeClock(2000, 0, 'b'),
    }

    const { merged, changed } = mergeFields(local, localClocks, remoteFields, remoteClocks)
    expect((merged as Record<string, unknown>).rich_text).toBe(richTextJson)
    expect(merged.text).toBe('bold')
    expect(changed).toBe(true)
  })

  it('concurrent rich_text + x edits both survive (field independence)', () => {
    const local = makeObj({ x: 100 })
    const localClocks: FieldClocks = {
      x: makeClock(2000, 0, 'a'),
    }
    const richTextJson = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"new"}]}]}'
    const remoteFields = { rich_text: richTextJson }
    const remoteClocks: FieldClocks = {
      rich_text: makeClock(2000, 0, 'b'),
    }

    const { merged } = mergeFields(local, localClocks, remoteFields, remoteClocks)
    expect(merged.x).toBe(100) // local x kept
    expect((merged as Record<string, unknown>).rich_text).toBe(richTextJson) // remote rich_text applied
  })

  it('rich_text LWW — newer local wins over older remote', () => {
    const localRichText = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"local"}]}]}'
    const local = { ...makeObj(), rich_text: localRichText } as TestObj
    const localClocks: FieldClocks = {
      rich_text: makeClock(3000, 0, 'a'),
    }
    const remoteRichText = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"remote"}]}]}'
    const remoteFields = { rich_text: remoteRichText }
    const remoteClocks: FieldClocks = {
      rich_text: makeClock(2000, 0, 'b'),
    }

    const { merged, changed } = mergeFields(local, localClocks, remoteFields, remoteClocks)
    expect((merged as Record<string, unknown>).rich_text).toBe(localRichText)
    expect(changed).toBe(false)
  })

  it('rich_text idempotency — same update applied twice is stable', () => {
    const local = makeObj()
    const localClocks: FieldClocks = {}
    const richTextJson = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"hello"}]}]}'
    const remoteFields = { rich_text: richTextJson }
    const remoteClocks: FieldClocks = { rich_text: makeClock(1000, 0, 'b') }

    const first = mergeFields(local, localClocks, remoteFields, remoteClocks)
    const second = mergeFields(first.merged, first.clocks, remoteFields, remoteClocks)
    expect((second.merged as Record<string, unknown>).rich_text).toBe(richTextJson)
    expect(second.changed).toBe(false)
  })

  it('rich_text convergence — two clients cross-sync rich_text produce same result', () => {
    const base = makeObj()

    const opsA = { fields: { rich_text: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A"}]}]}' }, clocks: { rich_text: makeClock(1000, 0, 'a') } }
    const opsB = { fields: { rich_text: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"B"}]}]}' }, clocks: { rich_text: makeClock(1001, 0, 'b') } }

    // Client A applies own then B
    let stateA = mergeFields(base, {}, opsA.fields, opsA.clocks)
    stateA = mergeFields(stateA.merged, stateA.clocks, opsB.fields, opsB.clocks)

    // Client B applies own then A
    let stateB = mergeFields(base, {}, opsB.fields, opsB.clocks)
    stateB = mergeFields(stateB.merged, stateB.clocks, opsA.fields, opsA.clocks)

    expect((stateA.merged as Record<string, unknown>).rich_text).toEqual((stateB.merged as Record<string, unknown>).rich_text)
    // B wins because 1001 > 1000
    expect((stateA.merged as Record<string, unknown>).rich_text).toBe(opsB.fields.rich_text)
  })

  it('rich_text null stays null when no remote update', () => {
    const local = makeObj()
    const localClocks: FieldClocks = {}
    const { merged, changed } = mergeFields(local, localClocks, {}, {})
    expect((merged as Record<string, unknown>).rich_text).toBeUndefined()
    expect(changed).toBe(false)
  })

  it('delete with newer clock wins over stale update', () => {
    const deleteClock = makeClock(2000, 0, 'a')
    const updateClocks: FieldClocks = {
      x: makeClock(1000, 0, 'b'),
      y: makeClock(1500, 0, 'b'),
    }

    expect(shouldDeleteWin(deleteClock, updateClocks)).toBe(true)
  })
})
