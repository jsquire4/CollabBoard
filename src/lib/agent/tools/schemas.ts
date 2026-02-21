/**
 * Tool schemas: Zod (for runtime validation) + JSON (for OpenAI API).
 * The JSON schemas are derived from Zod via z.toJSONSchema() — single source of truth.
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

export const saveMemorySchema = z.object({
  summary: z.string().min(1).max(2000).describe('The memory content to persist as a context object on the board'),
})

export const createDataConnectorSchema = z.object({
  targetObjectId: z.string().describe('The ID of the object to connect to'),
})

export const emptySchema = z.object({})

export const layoutObjectsSchema = z.object({
  objectIds: z.array(z.string()).optional().describe('IDs of objects to arrange. If omitted, arranges all moveable objects.'),
  layout: z.enum(['grid', 'horizontal', 'vertical']).describe('Layout strategy'),
  columns: z.number().optional().describe('Number of columns (grid only). Defaults to sqrt of object count.'),
  startX: z.number().optional().describe('Starting X coordinate. Defaults to 100.'),
  startY: z.number().optional().describe('Starting Y coordinate. Defaults to 100.'),
  padding: z.number().optional().describe('Spacing between objects in pixels. Defaults to 20.'),
})

// ── OpenAI JSON schemas (derived from Zod — single source of truth) ───────────

/**
 * Per-tool JSON schemas for the OpenAI Chat Completions `tools` parameter.
 * Generated from the Zod schemas above using z.toJSONSchema() — Zod 4 native.
 * The $schema field is stripped since OpenAI does not require it.
 */
export const TOOL_SCHEMAS: Record<string, Record<string, unknown>> = Object.fromEntries(
  (
    [
      ['createStickyNote', createStickyNoteSchema],
      ['createShape', createShapeSchema],
      ['createFrame', createFrameSchema],
      ['createTable', createTableSchema],
      ['createConnector', createConnectorSchema],
      ['moveObject', moveObjectSchema],
      ['resizeObject', resizeObjectSchema],
      ['updateText', updateTextSchema],
      ['changeColor', changeColorSchema],
      ['deleteObject', deleteObjectSchema],
      ['describeImage', describeImageSchema],
      ['readFileContent', readFileContentSchema],
      ['getFrameObjects', getFrameObjectsSchema],
      ['getConnectedObjects', emptySchema],
      ['saveMemory', saveMemorySchema],
      ['createDataConnector', createDataConnectorSchema],
      ['getBoardState', emptySchema],
      ['layoutObjects', layoutObjectsSchema],
    ] as const
  ).map(([name, schema]) => {
    const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>
    delete jsonSchema['$schema']
    return [name, jsonSchema]
  }),
)
