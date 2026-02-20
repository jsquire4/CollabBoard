/**
 * Supabase direct stress tests — batch inserts, concurrent upserts,
 * query performance, and channel saturation.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY env vars.
 * Skipped in CI without these vars.
 *
 * Run via: npm run test:stress
 */
import { describe, it, expect, afterAll, beforeAll, afterEach, beforeEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { printStressTable, StressMetric } from '@/test/stressTable'
import { v4 as uuid } from 'uuid'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const metrics: StressMetric[] = []
const createdBoardIds: string[] = []
const createdObjectIds: string[] = []

afterAll(() => {
  printStressTable('Supabase Stress Test Results', metrics)
})

describe.skipIf(!SUPABASE_URL || !SUPABASE_KEY)('Supabase direct stress', () => {
  const supabase = SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY)
    : null!

  let testBoardId: string
  let noAuth = false

  beforeAll(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      noAuth = true
      console.warn('No authenticated user — Supabase stress tests will be skipped.')
      return
    }

    testBoardId = uuid()
    const { error } = await supabase.from('boards').insert({
      id: testBoardId,
      name: `stress-test-${Date.now()}`,
      created_by: user.id,
    })
    if (error) throw new Error(`Failed to create test board: ${error.message}`)
    createdBoardIds.push(testBoardId)
  })

  beforeEach(({ skip }) => {
    if (noAuth) skip()
  })

  afterEach(async () => {
    // Clean up created objects
    if (createdObjectIds.length > 0) {
      const batch = [...createdObjectIds]
      createdObjectIds.length = 0
      // Delete in chunks of 100
      for (let i = 0; i < batch.length; i += 100) {
        const chunk = batch.slice(i, i + 100)
        await supabase.from('board_objects').delete().in('id', chunk)
      }
    }
  })

  afterAll(async () => {
    // Clean up test boards
    for (const boardId of createdBoardIds) {
      await supabase.from('board_objects').delete().eq('board_id', boardId)
      await supabase.from('boards').delete().eq('id', boardId)
    }
  })

  it('batch insert: 500 board_objects in rapid succession', async () => {

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const objects = Array.from({ length: 500 }, (_, i) => {
      const id = uuid()
      createdObjectIds.push(id)
      return {
        id,
        board_id: testBoardId,
        type: 'rectangle' as const,
        x: (i % 50) * 20,
        y: Math.floor(i / 50) * 20,
        width: 100,
        height: 80,
        z_index: i,
        created_by: user.id,
      }
    })

    const start = performance.now()
    // Insert in chunks of 100 (Supabase row limit per request)
    for (let i = 0; i < objects.length; i += 100) {
      const chunk = objects.slice(i, i + 100)
      const { error } = await supabase.from('board_objects').insert(chunk)
      if (error) throw new Error(`Batch insert failed at chunk ${i}: ${error.message}`)
    }
    const elapsed = Math.round(performance.now() - start)

    const pass = elapsed < 30000 // 30s budget for 500 rows
    metrics.push({ name: 'Batch insert (500)', value: `${elapsed}ms`, pass })
    expect(elapsed).toBeLessThan(30000)
  }, 60_000)

  it('concurrent upserts: 20 parallel upserts to same row', async () => {

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const objId = uuid()
    createdObjectIds.push(objId)

    // Create the object first
    await supabase.from('board_objects').insert({
      id: objId,
      board_id: testBoardId,
      type: 'rectangle' as const,
      x: 0,
      y: 0,
      width: 100,
      height: 80,
      z_index: 0,
      created_by: user.id,
    })

    const start = performance.now()
    // 20 parallel upserts to same row with different x values
    const upsertPromises = Array.from({ length: 20 }, (_, i) =>
      supabase.from('board_objects').update({ x: i * 10 }).eq('id', objId)
    )
    const results = await Promise.all(upsertPromises)
    const elapsed = Math.round(performance.now() - start)

    const errors = results.filter(r => r.error)
    const pass = errors.length === 0
    metrics.push({ name: 'Concurrent upserts (20)', value: `${elapsed}ms, ${errors.length} errs`, pass })

    expect(errors.length).toBe(0)

    // Final state should be deterministic (last write wins at DB level)
    const { data } = await supabase.from('board_objects').select('x').eq('id', objId).single()
    expect(data).toBeDefined()
    expect(typeof data!.x).toBe('number')
  }, 30_000)

  it('query performance: read board with many objects', async () => {

    // Query the board (may have objects from previous test)
    const start = performance.now()
    const { data, error } = await supabase
      .from('board_objects')
      .select('*')
      .eq('board_id', testBoardId)
      .is('deleted_at', null)
      .limit(5000)
    const elapsed = Math.round(performance.now() - start)

    expect(error).toBeNull()
    const rowCount = data?.length ?? 0

    const pass = elapsed < 5000
    metrics.push({ name: `Query (${rowCount} rows)`, value: `${elapsed}ms`, pass })
    expect(elapsed).toBeLessThan(5000)
  }, 15_000)

  it('realtime channel: broadcast 100 messages, measure delivery', async () => {

    const channelName = `stress-test-${Date.now()}`
    // Enable self-echo so we can measure delivery
    const channel = supabase.channel(channelName, { config: { broadcast: { self: true } } })

    let received = 0
    channel.on('broadcast', { event: 'stress' }, () => {
      received++
    })

    await new Promise<void>((resolve, reject) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve()
        else if (status === 'CHANNEL_ERROR') reject(new Error('Channel error'))
      })
    })

    const MESSAGES = 100
    const start = performance.now()

    for (let i = 0; i < MESSAGES; i++) {
      await channel.send({
        type: 'broadcast',
        event: 'stress',
        payload: { i, data: `msg-${i}` },
      })
    }

    // Wait for delivery (up to 5 seconds)
    await new Promise(resolve => setTimeout(resolve, 3000))
    const elapsed = Math.round(performance.now() - start)

    const deliveryRate = MESSAGES > 0 ? Math.round((received / MESSAGES) * 100) : 0
    const pass = elapsed < 15000
    metrics.push({
      name: `Broadcast (${MESSAGES} msgs)`,
      value: `${elapsed}ms, ${deliveryRate}% delivered`,
      pass,
    })

    await supabase.removeChannel(channel)
    expect(elapsed).toBeLessThan(15000)
    // With self-echo enabled, we should receive at least some messages
    expect(received).toBeGreaterThan(0)
  }, 30_000)

  it('concurrent clients: 5 parallel queries', async () => {

    const start = performance.now()
    const queryPromises = Array.from({ length: 5 }, () =>
      supabase
        .from('board_objects')
        .select('id, type, x, y')
        .eq('board_id', testBoardId)
        .limit(100)
    )
    const results = await Promise.all(queryPromises)
    const elapsed = Math.round(performance.now() - start)

    const errors = results.filter(r => r.error)
    const pass = errors.length === 0
    metrics.push({ name: 'Concurrent queries (5)', value: `${elapsed}ms, ${errors.length} errs`, pass })

    expect(errors.length).toBe(0)
  }, 15_000)
})
