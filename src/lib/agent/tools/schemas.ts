/**
 * Tool schemas: Zod (for runtime validation) + JSON (for OpenAI API).
 * The JSON schemas are derived from Zod via z.toJSONSchema() — single source of truth.
 */

import { z } from 'zod'

// ── Zod schemas ───────────────────────────────────────────────────────────────

export const createStickyNoteSchema = z.object({
  text: z.string().default(''),
  color: z.string().optional().describe('Hex color'),
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

export const computePlacementSchema = z.object({
  width: z.number().positive().describe('Template width px'),
  height: z.number().positive().describe('Template height px'),
  gridRows: z.number().int().min(1).describe('Rows'),
  gridCols: z.number().int().min(1).describe('Columns'),
  padding: z.number().optional().default(20).describe('Cell gap px (default 20)'),
})

export const precomputePlacementsSchema = z.object({
  quickActionIds: z.array(z.string()).min(1).describe('Quick action IDs in order (e.g. ["swot","swot"] for two SWOTs). Use after user clarifies the request.'),
})

export const layoutObjectsSchema = z.object({
  objectIds: z.array(z.string()).optional().describe('Object IDs; omit for all moveable'),
  layout: z.enum(['grid', 'horizontal', 'vertical', 'circle']).describe('Layout type'),
  columns: z.number().optional().describe('Cols for grid (default sqrt of count)'),
  startX: z.number().optional().describe('Origin X (default 100)'),
  startY: z.number().optional().describe('Origin Y (default 100)'),
  padding: z.number().optional().describe('Spacing px (default 20)'),
  radius: z.number().optional().describe('Circle radius px (circle layout only)'),
})

// ── Organization ─────────────────────────────────────────────────────────────

export const duplicateObjectSchema = z.object({
  id: z.string().describe('Object id'),
})

const Z_ORDER_ACTIONS = ['front', 'back', 'forward', 'backward'] as const

export const updateZIndexSchema = z.object({
  id: z.string().describe('Object id'),
  action: z.enum(Z_ORDER_ACTIONS).describe('front|back|forward|backward'),
})

export const groupObjectsSchema = z.object({
  objectIds: z.array(z.string()).min(2).describe('Object IDs (min 2)'),
})

export const ungroupObjectsSchema = z.object({
  groupId: z.string().describe('Group id'),
})

// ── Table edit ───────────────────────────────────────────────────────────────

export const getTableDataSchema = z.object({
  objectId: z.string().describe('Table object id'),
})

export const updateTableCellSchema = z.object({
  objectId: z.string(),
  rowIndex: z.number().int().min(0),
  colIndex: z.number().int().min(0),
  text: z.string(),
})

export const updateTableHeaderSchema = z.object({
  objectId: z.string(),
  colIndex: z.number().int().min(0),
  name: z.string(),
})

export const addTableRowSchema = z.object({
  objectId: z.string(),
  afterIndex: z.number().int().min(0).optional().describe('Insert after row (0-based); omit to append'),
})

export const deleteTableRowSchema = z.object({
  objectId: z.string(),
  rowIndex: z.number().int().min(0),
})

export const addTableColumnSchema = z.object({
  objectId: z.string(),
  afterIndex: z.number().int().min(0).optional().describe('Insert after col (0-based); omit to append'),
})

export const deleteTableColumnSchema = z.object({
  objectId: z.string(),
  colIndex: z.number().int().min(0),
})

export const renameTableSchema = z.object({
  objectId: z.string(),
  name: z.string().transform(s => s.trim()).pipe(z.string().min(1).max(100)),
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
      ['duplicateObject', duplicateObjectSchema],
      ['updateZIndex', updateZIndexSchema],
      ['groupObjects', groupObjectsSchema],
      ['ungroupObjects', ungroupObjectsSchema],
      ['getTableData', getTableDataSchema],
      ['updateTableCell', updateTableCellSchema],
      ['updateTableHeader', updateTableHeaderSchema],
      ['addTableRow', addTableRowSchema],
      ['deleteTableRow', deleteTableRowSchema],
      ['addTableColumn', addTableColumnSchema],
      ['deleteTableColumn', deleteTableColumnSchema],
      ['renameTable', renameTableSchema],
      ['describeImage', describeImageSchema],
      ['readFileContent', readFileContentSchema],
      ['getFrameObjects', getFrameObjectsSchema],
      ['getConnectedObjects', emptySchema],
      ['saveMemory', saveMemorySchema],
      ['createDataConnector', createDataConnectorSchema],
      ['getBoardState', emptySchema],
      ['computePlacement', computePlacementSchema],
      ['precomputePlacements', precomputePlacementsSchema],
      ['layoutObjects', layoutObjectsSchema],
    ] as const
  ).map(([name, schema]) => {
    const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>
    delete jsonSchema['$schema']
    return [name, jsonSchema]
  }),
)
