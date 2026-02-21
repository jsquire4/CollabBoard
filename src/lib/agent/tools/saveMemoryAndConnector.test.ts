/**
 * Tests for saveMemory and createDataConnector tools.
 * Strategy: Same mock pattern as tools.test.ts — vi.hoisted + partial mock of ./helpers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mock references ──────────────────────────────────────────────────

const {
  mockBuildAndInsertObject,
  mockGetMaxZIndex,
  mockBroadcastChanges,
  mockGetShapeDefaults,
  mockCreateAdminClient,
} = vi.hoisted(() => ({
  mockBuildAndInsertObject: vi.fn(),
  mockGetMaxZIndex: vi.fn(() => 0),
  mockBroadcastChanges: vi.fn(),
  mockGetShapeDefaults: vi.fn(),
  mockCreateAdminClient: vi.fn(),
}))

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('./helpers', async () => {
  const actual = await vi.importActual<typeof import('./helpers')>('./helpers')
  return {
    ...actual,
    buildAndInsertObject: mockBuildAndInsertObject,
  }
})

vi.mock('@/lib/agent/boardState', () => ({
  getMaxZIndex: mockGetMaxZIndex,
  broadcastChanges: mockBroadcastChanges,
}))

vi.mock('@/lib/agent/defaults', () => ({
  getShapeDefaults: mockGetShapeDefaults,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mockCreateAdminClient,
}))

// Import AFTER mocks
import { createObjectTools } from './createObjects'
import type { ToolContext } from './types'
import type { BoardObject } from '@/types/board'

// ── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_SHAPE_DEFAULTS = {
  width: 180, height: 100, color: '#F1F5F9',
  text: '', font_size: 12,
}

const CONNECTOR_DEFAULTS = {
  width: 120, height: 2, color: '#7C3AED', stroke_width: 2,
}

function makeCtx(objects?: Map<string, BoardObject>, agentObjectId?: string): ToolContext {
  return {
    boardId: 'board-1',
    userId: 'user-1',
    hlc: { ts: Date.now(), c: 0, n: 'user-1' },
    state: {
      boardId: 'board-1',
      objects: objects ?? new Map(),
      fieldClocks: new Map(),
    },
    agentObjectId,
  }
}

function makeBoardObject(overrides: Partial<BoardObject> = {}): BoardObject {
  return {
    id: 'obj-1',
    board_id: 'board-1',
    type: 'agent',
    x: 100,
    y: 200,
    width: 200,
    height: 140,
    rotation: 0,
    text: 'Agent',
    color: '#EEF2FF',
    font_size: 14,
    z_index: 1,
    parent_id: null,
    created_by: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    field_clocks: null,
    ...overrides,
  } as unknown as BoardObject
}

function getTool(name: string) {
  const tool = createObjectTools.find(t => t.name === name)
  if (!tool) throw new Error(`Tool ${name} not found`)
  return tool
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('saveMemory tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetShapeDefaults.mockImplementation((type: string) => {
      if (type === 'context_object') return DEFAULT_SHAPE_DEFAULTS
      if (type === 'data_connector') return CONNECTOR_DEFAULTS
      return DEFAULT_SHAPE_DEFAULTS
    })
    mockBuildAndInsertObject.mockResolvedValue({
      success: true,
      id: 'new-obj-id',
      obj: { id: 'new-obj-id', type: 'context_object' },
    })
    mockGetMaxZIndex.mockReturnValue(0)
  })

  it('happy path: creates context_object + data_connector, returns ids and summary', async () => {
    const agent = makeBoardObject({ id: 'agent-1', type: 'agent' })
    const objects = new Map([['agent-1', agent]])
    const ctx = makeCtx(objects, 'agent-1')

    // Two calls: first for context_object, second for data_connector
    mockBuildAndInsertObject
      .mockResolvedValueOnce({ success: true, id: 'ctx-obj-1', obj: { id: 'ctx-obj-1', type: 'context_object' } })
      .mockResolvedValueOnce({ success: true, id: 'conn-1', obj: { id: 'conn-1', type: 'data_connector' } })

    const result = await getTool('saveMemory').executor(ctx, { summary: 'Important info' })

    expect(result).toMatchObject({
      contextObjectId: 'ctx-obj-1',
      connectorId: 'conn-1',
      summary: 'Important info',
    })
    expect(mockBuildAndInsertObject).toHaveBeenCalledTimes(2)
    expect(mockBroadcastChanges).toHaveBeenCalledOnce()
  })

  it('requires agentObjectId in context', async () => {
    const ctx = makeCtx() // no agentObjectId
    const result = await getTool('saveMemory').executor(ctx, { summary: 'test' })
    expect(result).toEqual({ error: 'saveMemory is only available for per-agent chat' })
  })

  it('agent not found in state → error', async () => {
    const ctx = makeCtx(new Map(), 'agent-missing')
    const result = await getTool('saveMemory').executor(ctx, { summary: 'test' })
    expect(result).toEqual({ error: 'Agent object not found' })
  })

  it('stacks vertically below existing context objects', async () => {
    const agent = makeBoardObject({ id: 'agent-1', type: 'agent', x: 100, y: 200, width: 200, height: 140 })
    // Existing connector + context_object connected to agent
    const connector = makeBoardObject({
      id: 'conn-existing',
      type: 'data_connector',
      connect_start_id: 'agent-1',
      connect_end_id: 'ctx-existing',
      deleted_at: null,
    } as Partial<BoardObject>)
    const ctxObj = makeBoardObject({
      id: 'ctx-existing',
      type: 'context_object',
      deleted_at: null,
    })

    const objects = new Map([
      ['agent-1', agent],
      ['conn-existing', connector],
      ['ctx-existing', ctxObj],
    ])
    const ctx = makeCtx(objects, 'agent-1')

    mockBuildAndInsertObject
      .mockResolvedValueOnce({ success: true, id: 'ctx-2', obj: { id: 'ctx-2' } })
      .mockResolvedValueOnce({ success: true, id: 'conn-2', obj: { id: 'conn-2' } })

    await getTool('saveMemory').executor(ctx, { summary: 'Second memory' })

    // First call should be for context_object, check y position is offset
    const [, type, fields] = mockBuildAndInsertObject.mock.calls[0]
    expect(type).toBe('context_object')
    // contextCount=1, so y should be agent.y + 1 * (100 + 20) = 200 + 120 = 320
    expect(fields.y).toBe(200 + 1 * (DEFAULT_SHAPE_DEFAULTS.height + 20))
  })

  it('insert failure for context object → error', async () => {
    const agent = makeBoardObject({ id: 'agent-1', type: 'agent' })
    const objects = new Map([['agent-1', agent]])
    const ctx = makeCtx(objects, 'agent-1')

    mockBuildAndInsertObject.mockResolvedValueOnce({ success: false, error: 'DB insert failed' })

    const result = await getTool('saveMemory').executor(ctx, { summary: 'test' })
    expect(result).toEqual({ error: 'DB insert failed' })
  })

  it('insert failure for connector → error', async () => {
    const agent = makeBoardObject({ id: 'agent-1', type: 'agent' })
    const objects = new Map([['agent-1', agent]])
    const ctx = makeCtx(objects, 'agent-1')

    mockBuildAndInsertObject
      .mockResolvedValueOnce({ success: true, id: 'ctx-1', obj: { id: 'ctx-1' } })
      .mockResolvedValueOnce({ success: false, error: 'Connector insert failed' })

    const result = await getTool('saveMemory').executor(ctx, { summary: 'test' })
    expect(result).toEqual({ error: 'Connector insert failed' })
  })
})

describe('createDataConnector tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetShapeDefaults.mockReturnValue(CONNECTOR_DEFAULTS)
    mockBuildAndInsertObject.mockResolvedValue({
      success: true,
      id: 'new-conn-id',
      obj: { id: 'new-conn-id', type: 'data_connector' },
    })
    mockGetMaxZIndex.mockReturnValue(0)
  })

  it('happy path: creates connector from agent to target', async () => {
    const agent = makeBoardObject({ id: 'agent-1', type: 'agent' })
    const target = makeBoardObject({ id: 'target-1', type: 'sticky_note', deleted_at: null })
    const objects = new Map([['agent-1', agent], ['target-1', target]])
    const ctx = makeCtx(objects, 'agent-1')

    const result = await getTool('createDataConnector').executor(ctx, { targetObjectId: 'target-1' })

    expect(result).toMatchObject({ id: 'new-conn-id', targetObjectId: 'target-1' })
    expect(mockBuildAndInsertObject).toHaveBeenCalledOnce()
    expect(mockBroadcastChanges).toHaveBeenCalledOnce()
  })

  it('requires agentObjectId in context', async () => {
    const ctx = makeCtx()
    const result = await getTool('createDataConnector').executor(ctx, { targetObjectId: 'x' })
    expect(result).toEqual({ error: 'createDataConnector is only available for per-agent chat' })
  })

  it('target not found → error', async () => {
    const agent = makeBoardObject({ id: 'agent-1', type: 'agent' })
    const objects = new Map([['agent-1', agent]])
    const ctx = makeCtx(objects, 'agent-1')

    const result = await getTool('createDataConnector').executor(ctx, { targetObjectId: 'missing' })
    expect(result).toEqual({ error: 'Target object missing not found' })
  })

  it('vector-type target is rejected (line, arrow, data_connector)', async () => {
    const agent = makeBoardObject({ id: 'agent-1', type: 'agent' })

    for (const vectorType of ['line', 'arrow', 'data_connector'] as const) {
      const target = makeBoardObject({ id: 'vec-1', type: vectorType, deleted_at: null })
      const objects = new Map([['agent-1', agent], ['vec-1', target]])
      const ctx = makeCtx(objects, 'agent-1')

      const result = await getTool('createDataConnector').executor(ctx, { targetObjectId: 'vec-1' })
      expect(result).toEqual({ error: `Cannot connect to a ${vectorType}` })
    }
  })

  it('insert failure → error', async () => {
    const agent = makeBoardObject({ id: 'agent-1', type: 'agent' })
    const target = makeBoardObject({ id: 'target-1', type: 'rectangle', deleted_at: null })
    const objects = new Map([['agent-1', agent], ['target-1', target]])
    const ctx = makeCtx(objects, 'agent-1')

    mockBuildAndInsertObject.mockResolvedValueOnce({ success: false, error: 'Insert failed' })

    const result = await getTool('createDataConnector').executor(ctx, { targetObjectId: 'target-1' })
    expect(result).toEqual({ error: 'Insert failed' })
  })
})
