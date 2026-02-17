/**
 * Hybrid Logical Clock (HLC) implementation.
 *
 * Provides a total order over events that respects causality:
 * if event A causally precedes event B, then hlc(A) < hlc(B).
 * For concurrent events, the node ID provides a deterministic tie-break.
 *
 * Pure TypeScript — no framework imports. Safe for Deno Edge Functions.
 */

export interface HLC {
  /** Wall-clock timestamp (ms). Always >= real time due to max() on receive. */
  ts: number
  /** Counter — disambiguates events with the same ts. */
  c: number
  /** Node (user) ID — deterministic tie-break for identical ts+c. */
  n: string
}

/** Create a fresh HLC for a new node. */
export function createHLC(nodeId: string): HLC {
  return { ts: Date.now(), c: 0, n: nodeId }
}

/** Advance the local clock for a new local event. */
export function tickHLC(local: HLC): HLC {
  const now = Date.now()
  if (now > local.ts) {
    return { ts: now, c: 0, n: local.n }
  }
  // Wall clock hasn't advanced — increment counter
  return { ts: local.ts, c: local.c + 1, n: local.n }
}

/**
 * Update the local clock upon receiving a remote clock.
 * Ensures the local clock is always >= both its own value and the remote value.
 */
export function receiveHLC(local: HLC, remote: HLC): HLC {
  const now = Date.now()

  // Case 1: Wall clock is strictly ahead of both — reset counter
  if (now > local.ts && now > remote.ts) {
    return { ts: now, c: 0, n: local.n }
  }

  // Case 2: Local and remote have the same ts (and both >= now)
  if (local.ts === remote.ts) {
    return { ts: local.ts, c: Math.max(local.c, remote.c) + 1, n: local.n }
  }

  // Case 3: Local ts is strictly ahead of remote
  if (local.ts > remote.ts) {
    return { ts: local.ts, c: local.c + 1, n: local.n }
  }

  // Case 4: Remote ts is strictly ahead of local
  return { ts: remote.ts, c: remote.c + 1, n: local.n }
}

/**
 * Returns true if clock `a` is strictly greater than clock `b`.
 * Total order: ts → counter → node ID (lexicographic).
 */
export function hlcGreaterThan(a: HLC, b: HLC): boolean {
  if (a.ts !== b.ts) return a.ts > b.ts
  if (a.c !== b.c) return a.c > b.c
  return a.n > b.n
}

/** Compare two HLCs. Returns negative if a < b, 0 if equal, positive if a > b. */
export function hlcCompare(a: HLC, b: HLC): number {
  if (a.ts !== b.ts) return a.ts - b.ts
  if (a.c !== b.c) return a.c - b.c
  if (a.n < b.n) return -1
  if (a.n > b.n) return 1
  return 0
}
