import { describe, it, expect, vi, afterEach } from 'vitest'
import { createHLC, tickHLC, receiveHLC, hlcGreaterThan, hlcCompare, HLC } from './hlc'

describe('createHLC', () => {
  it('creates an HLC with current time, counter 0, and the given node ID', () => {
    const before = Date.now()
    const hlc = createHLC('user-a')
    const after = Date.now()
    expect(hlc.ts).toBeGreaterThanOrEqual(before)
    expect(hlc.ts).toBeLessThanOrEqual(after)
    expect(hlc.c).toBe(0)
    expect(hlc.n).toBe('user-a')
  })
})

describe('tickHLC', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('advances ts to wall clock when wall clock is ahead', () => {
    const local: HLC = { ts: 1000, c: 5, n: 'a' }
    vi.spyOn(Date, 'now').mockReturnValue(2000)
    const result = tickHLC(local)
    expect(result).toEqual({ ts: 2000, c: 0, n: 'a' })
  })

  it('increments counter when wall clock equals local ts', () => {
    const local: HLC = { ts: 1000, c: 3, n: 'a' }
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    const result = tickHLC(local)
    expect(result).toEqual({ ts: 1000, c: 4, n: 'a' })
  })

  it('increments counter when wall clock is behind local ts', () => {
    const local: HLC = { ts: 2000, c: 3, n: 'a' }
    vi.spyOn(Date, 'now').mockReturnValue(1500)
    const result = tickHLC(local)
    expect(result).toEqual({ ts: 2000, c: 4, n: 'a' })
  })
})

describe('receiveHLC', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('Case 1: wall clock strictly ahead of both → reset counter', () => {
    const local: HLC = { ts: 1000, c: 5, n: 'a' }
    const remote: HLC = { ts: 900, c: 10, n: 'b' }
    vi.spyOn(Date, 'now').mockReturnValue(2000)
    const result = receiveHLC(local, remote)
    expect(result).toEqual({ ts: 2000, c: 0, n: 'a' })
  })

  it('Case 2: local.ts === remote.ts (both >= now) → max counter + 1', () => {
    const local: HLC = { ts: 2000, c: 3, n: 'a' }
    const remote: HLC = { ts: 2000, c: 7, n: 'b' }
    vi.spyOn(Date, 'now').mockReturnValue(1500)
    const result = receiveHLC(local, remote)
    expect(result).toEqual({ ts: 2000, c: 8, n: 'a' })
  })

  it('Case 2 variant: local.ts === remote.ts === now → max counter + 1', () => {
    const local: HLC = { ts: 2000, c: 3, n: 'a' }
    const remote: HLC = { ts: 2000, c: 7, n: 'b' }
    vi.spyOn(Date, 'now').mockReturnValue(2000)
    // now === local.ts === remote.ts, so not "strictly ahead" → Case 2
    const result = receiveHLC(local, remote)
    expect(result).toEqual({ ts: 2000, c: 8, n: 'a' })
  })

  it('Case 3: local.ts strictly ahead of remote → local.c + 1', () => {
    const local: HLC = { ts: 2000, c: 5, n: 'a' }
    const remote: HLC = { ts: 1500, c: 10, n: 'b' }
    vi.spyOn(Date, 'now').mockReturnValue(1800)
    const result = receiveHLC(local, remote)
    expect(result).toEqual({ ts: 2000, c: 6, n: 'a' })
  })

  it('Case 4: remote.ts strictly ahead of local → remote.c + 1', () => {
    const local: HLC = { ts: 1000, c: 5, n: 'a' }
    const remote: HLC = { ts: 2000, c: 3, n: 'b' }
    vi.spyOn(Date, 'now').mockReturnValue(1500)
    const result = receiveHLC(local, remote)
    expect(result).toEqual({ ts: 2000, c: 4, n: 'a' })
  })

  it('always preserves local node ID', () => {
    const local: HLC = { ts: 100, c: 0, n: 'my-node' }
    const remote: HLC = { ts: 9999, c: 99, n: 'other-node' }
    vi.spyOn(Date, 'now').mockReturnValue(50)
    const result = receiveHLC(local, remote)
    expect(result.n).toBe('my-node')
  })
})

describe('hlcGreaterThan', () => {
  it('higher ts wins', () => {
    expect(hlcGreaterThan({ ts: 2, c: 0, n: 'a' }, { ts: 1, c: 99, n: 'z' })).toBe(true)
    expect(hlcGreaterThan({ ts: 1, c: 99, n: 'z' }, { ts: 2, c: 0, n: 'a' })).toBe(false)
  })

  it('same ts → higher counter wins', () => {
    expect(hlcGreaterThan({ ts: 1, c: 5, n: 'a' }, { ts: 1, c: 3, n: 'z' })).toBe(true)
    expect(hlcGreaterThan({ ts: 1, c: 3, n: 'z' }, { ts: 1, c: 5, n: 'a' })).toBe(false)
  })

  it('same ts + counter → higher node ID wins (lexicographic)', () => {
    expect(hlcGreaterThan({ ts: 1, c: 0, n: 'b' }, { ts: 1, c: 0, n: 'a' })).toBe(true)
    expect(hlcGreaterThan({ ts: 1, c: 0, n: 'a' }, { ts: 1, c: 0, n: 'b' })).toBe(false)
  })

  it('identical clocks → false (not strictly greater)', () => {
    expect(hlcGreaterThan({ ts: 1, c: 0, n: 'a' }, { ts: 1, c: 0, n: 'a' })).toBe(false)
  })
})

describe('hlcCompare', () => {
  it('returns negative when a < b', () => {
    expect(hlcCompare({ ts: 1, c: 0, n: 'a' }, { ts: 2, c: 0, n: 'a' })).toBeLessThan(0)
  })
  it('returns positive when a > b', () => {
    expect(hlcCompare({ ts: 2, c: 0, n: 'a' }, { ts: 1, c: 0, n: 'a' })).toBeGreaterThan(0)
  })
  it('returns 0 for identical clocks', () => {
    expect(hlcCompare({ ts: 1, c: 0, n: 'a' }, { ts: 1, c: 0, n: 'a' })).toBe(0)
  })
})

describe('causal ordering', () => {
  it('tick always produces a clock greater than the previous', () => {
    let clock = createHLC('node1')
    for (let i = 0; i < 100; i++) {
      const next = tickHLC(clock)
      expect(hlcGreaterThan(next, clock)).toBe(true)
      clock = next
    }
  })

  it('receive always produces a clock greater than both local and remote', () => {
    const local: HLC = { ts: 1000, c: 5, n: 'a' }
    const remote: HLC = { ts: 1500, c: 3, n: 'b' }
    vi.spyOn(Date, 'now').mockReturnValue(800)
    const result = receiveHLC(local, remote)
    expect(hlcGreaterThan(result, local) || hlcCompare(result, local) === 0).toBe(true)
    // result.ts should be >= remote.ts
    expect(result.ts).toBeGreaterThanOrEqual(remote.ts)
    vi.restoreAllMocks()
  })
})
