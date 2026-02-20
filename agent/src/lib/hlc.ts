/**
 * Hybrid Logical Clock (HLC) implementation.
 * Inlined from src/lib/crdt/hlc.ts — must stay in sync.
 */

export interface HLC {
  ts: number
  c: number
  n: string
}

export function createHLC(nodeId: string): HLC {
  return { ts: Date.now(), c: 0, n: nodeId }
}

export function tickHLC(local: HLC): HLC {
  const now = Date.now()
  if (now > local.ts) {
    return { ts: now, c: 0, n: local.n }
  }
  return { ts: local.ts, c: local.c + 1, n: local.n }
}

export function receiveHLC(local: HLC, remote: HLC): HLC {
  const now = Date.now()
  if (now > local.ts && now > remote.ts) {
    return { ts: now, c: 0, n: local.n }
  }
  if (local.ts === remote.ts) {
    return { ts: local.ts, c: Math.max(local.c, remote.c) + 1, n: local.n }
  }
  if (local.ts > remote.ts) {
    return { ts: local.ts, c: local.c + 1, n: local.n }
  }
  return { ts: remote.ts, c: remote.c + 1, n: local.n }
}

export function hlcGreaterThan(a: HLC, b: HLC): boolean {
  if (a.ts !== b.ts) return a.ts > b.ts
  if (a.c !== b.c) return a.c > b.c
  return a.n > b.n
}

export function hlcCompare(a: HLC, b: HLC): number {
  if (a.ts !== b.ts) return a.ts - b.ts
  if (a.c !== b.c) return a.c - b.c
  if (a.n < b.n) return -1
  if (a.n > b.n) return 1
  return 0
}
