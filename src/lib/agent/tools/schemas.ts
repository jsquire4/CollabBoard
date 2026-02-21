/**
 * Tool schemas: Zod (for runtime validation) + JSON (for OpenAI API).
 * Both must be maintained manually — Zod 4 dropped instanceof-based introspection.
 */

import { z } from 'zod'

// ── Zod schemas ───────────────────────────────────────────────────────────────

export const createStickyNoteSchema = z.object({
  text: z.string().default(''),
  color: z.string().optional().describe('Hex color, e.g. #FFEB3B'),
  x: z.number().optional(),
  y: z.number().optional(),
  title: z.string().optional(),
})

export const createShapeSchema = z.object({
  type: z.enum(['rectangle', 'circle', 'triangle', 'chevron', 'parallelogram', 'ngon']),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  color: z.string().optional(),
  text: z.string().optional(),
  sides: z.number().optional(),
})

export const createFrameSchema = z.object({
  title: z.string().optional().default('Frame'),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  color: z.string().optional(),
})

export const createTableSchema = z.object({
  columns: z.number().min(1).max(10).default(3),
  rows: z.number().min(1).max(20).default(3),
  x: z.number().optional(),
  y: z.number().optional(),
  title: z.string().optional(),
})

const ANCHOR_VALUES = ['top', 'right', 'bottom', 'left', 'center'] as const

export const createConnectorSchema = z.object({
  type: z.enum(['line', 'arrow']).default('arrow'),
  startObjectId: z.string(),
  endObjectId: z.string(),
  startAnchor: z.enum(ANCHOR_VALUES).optional().default('right'),
  endAnchor: z.enum(ANCHOR_VALUES).optional().default('left'),
  color: z.string().optional(),
})

export const moveObjectSchema = z.object({
  id: z.string(),
  x: z.number().min(-50_000).max(50_000),
  y: z.number().min(-50_000).max(50_000),
})

export const resizeObjectSchema = z.object({
  id: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
})

export const updateTextSchema = z.object({
  id: z.string(),
  text: z.string().optional(),
  title: z.string().optional(),
})

export const changeColorSchema = z.object({
  id: z.string(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color, e.g. #FF5733'),
})

export const deleteObjectSchema = z.object({
  id: z.string(),
})

export const describeImageSchema = z.object({
  objectId: z.string(),
})

export const readFileContentSchema = z.object({
  objectId: z.string(),
})

export const getFrameObjectsSchema = z.object({
  frameId: z.string(),
})

export const emptySchema = z.object({})

// ── OpenAI JSON schemas ───────────────────────────────────────────────────────

export const TOOL_SCHEMAS: Record<string, Record<string, unknown>> = {
  createStickyNote: {
    type: 'object',
    properties: {
      text: { type: 'string' },
      color: { type: 'string', description: 'Hex color, e.g. #FFEB3B' },
      x: { type: 'number' },
      y: { type: 'number' },
      title: { type: 'string' },
    },
  },
  createShape: {
    type: 'object',
    required: ['type'],
    properties: {
      type: { type: 'string', enum: ['rectangle', 'circle', 'triangle', 'chevron', 'parallelogram', 'ngon'] },
      x: { type: 'number' }, y: { type: 'number' },
      width: { type: 'number' }, height: { type: 'number' },
      color: { type: 'string' }, text: { type: 'string' },
      sides: { type: 'number', description: 'Number of sides for ngon type' },
    },
  },
  createFrame: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      x: { type: 'number' }, y: { type: 'number' },
      width: { type: 'number' }, height: { type: 'number' },
      color: { type: 'string' },
    },
  },
  createTable: {
    type: 'object',
    properties: {
      columns: { type: 'number' }, rows: { type: 'number' },
      x: { type: 'number' }, y: { type: 'number' },
      title: { type: 'string' },
    },
  },
  createConnector: {
    type: 'object',
    required: ['startObjectId', 'endObjectId'],
    properties: {
      type: { type: 'string', enum: ['line', 'arrow'] },
      startObjectId: { type: 'string' }, endObjectId: { type: 'string' },
      startAnchor: { type: 'string', enum: ['top', 'right', 'bottom', 'left', 'center'] },
      endAnchor: { type: 'string', enum: ['top', 'right', 'bottom', 'left', 'center'] },
      color: { type: 'string' },
    },
  },
  moveObject: {
    type: 'object',
    required: ['id', 'x', 'y'],
    properties: {
      id: { type: 'string' },
      x: { type: 'number', minimum: -50000, maximum: 50000 },
      y: { type: 'number', minimum: -50000, maximum: 50000 },
    },
  },
  resizeObject: {
    type: 'object',
    required: ['id', 'width', 'height'],
    properties: {
      id: { type: 'string' },
      width: { type: 'number', exclusiveMinimum: 0 },
      height: { type: 'number', exclusiveMinimum: 0 },
    },
  },
  updateText: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' }, text: { type: 'string' }, title: { type: 'string' },
    },
  },
  changeColor: {
    type: 'object',
    required: ['id', 'color'],
    properties: {
      id: { type: 'string' },
      color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$', description: 'Hex color, e.g. #FF5733' },
    },
  },
  deleteObject: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string' } },
  },
  describeImage: {
    type: 'object',
    required: ['objectId'],
    properties: { objectId: { type: 'string' } },
  },
  readFileContent: {
    type: 'object',
    required: ['objectId'],
    properties: { objectId: { type: 'string' } },
  },
  getFrameObjects: {
    type: 'object',
    required: ['frameId'],
    properties: { frameId: { type: 'string' } },
  },
  getBoardState: {
    type: 'object',
    properties: {},
  },
}
