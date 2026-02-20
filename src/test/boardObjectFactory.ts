import { BoardObject, BoardObjectType } from '@/types/board'

let counter = 0

function nextId(): string {
  counter++
  return `test-obj-${counter}`
}

/** Reset ID counter between tests */
export function resetFactory(): void {
  counter = 0
}

export function makeObject(overrides?: Partial<BoardObject>): BoardObject {
  const id = overrides?.id ?? nextId()
  return {
    id,
    board_id: 'test-board',
    type: 'rectangle' as BoardObjectType,
    x: 100,
    y: 100,
    width: 120,
    height: 80,
    rotation: 0,
    text: '',
    color: '#4A90D9',
    font_size: 14,
    z_index: 0,
    parent_id: null,
    created_by: 'test-user',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

export function makeRectangle(overrides?: Partial<BoardObject>): BoardObject {
  return makeObject({ type: 'rectangle', width: 120, height: 80, ...overrides })
}

export function makeCircle(overrides?: Partial<BoardObject>): BoardObject {
  return makeObject({ type: 'circle', width: 100, height: 100, ...overrides })
}

export function makeLine(overrides?: Partial<BoardObject>): BoardObject {
  return makeObject({
    type: 'line',
    width: 0,
    height: 0,
    x: 50,
    y: 50,
    x2: 200,
    y2: 150,
    color: '#333333',
    ...overrides,
  })
}

export function makeArrow(overrides?: Partial<BoardObject>): BoardObject {
  return makeLine({ type: 'arrow', marker_end: 'arrow', ...overrides })
}

export function makeStickyNote(overrides?: Partial<BoardObject>): BoardObject {
  return makeObject({
    type: 'sticky_note',
    width: 200,
    height: 200,
    color: '#FDFD96',
    text: 'Note text',
    ...overrides,
  })
}

/** Create a group object. Caller must set parent_id on children separately. */
export function makeGroup(overrides?: Partial<BoardObject>): BoardObject {
  return makeObject({ type: 'group', color: 'transparent', ...overrides })
}

export function makeFrame(overrides?: Partial<BoardObject>): BoardObject {
  return makeObject({
    type: 'frame',
    width: 400,
    height: 300,
    color: 'rgba(200,200,200,0.1)',
    title: 'Frame',
    ...overrides,
  })
}

export function makeTable(overrides?: Partial<BoardObject>): BoardObject {
  return makeObject({
    type: 'table',
    width: 360,
    height: 128,
    color: '#FFFFFF',
    table_data: JSON.stringify({
      columns: [
        { id: 'col-1', name: 'Column 1', width: 120 },
        { id: 'col-2', name: 'Column 2', width: 120 },
        { id: 'col-3', name: 'Column 3', width: 120 },
      ],
      rows: [
        { id: 'row-1', height: 32, cells: { 'col-1': { text: '' }, 'col-2': { text: '' }, 'col-3': { text: '' } } },
        { id: 'row-2', height: 32, cells: { 'col-1': { text: '' }, 'col-2': { text: '' }, 'col-3': { text: '' } } },
        { id: 'row-3', height: 32, cells: { 'col-1': { text: '' }, 'col-2': { text: '' }, 'col-3': { text: '' } } },
      ],
    }),
    ...overrides,
  })
}

/** Create a board object with a minimal TipTap rich_text doc. */
export function makeRichTextObject(overrides?: Partial<BoardObject>): BoardObject {
  const doc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Rich text content' }],
      },
    ],
  }
  return makeObject({
    type: 'rectangle',
    text: 'Rich text content',
    rich_text: JSON.stringify(doc),
    ...overrides,
  })
}

/** Build an objects Map from an array */
export function objectsMap(...objs: BoardObject[]): Map<string, BoardObject> {
  return new Map(objs.map(o => [o.id, o]))
}

export function makeAgent(overrides?: Partial<BoardObject>): BoardObject {
  return makeObject({
    type: "agent",
    agent_state: "idle",
    width: 200,
    height: 140,
    color: "#EEF2FF",
    ...overrides,
  })
}

export function makeAgentOutput(overrides?: Partial<BoardObject>): BoardObject {
  return makeObject({
    type: "agent_output",
    source_agent_id: null,
    width: 240,
    height: 160,
    color: "#F0FDF4",
    ...overrides,
  })
}

export function makeDataConnector(overrides?: Partial<BoardObject>): BoardObject {
  return makeObject({
    type: "data_connector",
    x2: 120,
    y2: 0,
    width: 120,
    height: 2,
    color: "#7C3AED",
    ...overrides,
  })
}

export function makeContextObject(overrides?: Partial<BoardObject>): BoardObject {
  return makeObject({
    type: "context_object",
    file_id: null,
    width: 180,
    height: 100,
    ...overrides,
  })
}

export function makeStatusBadge(overrides?: Partial<BoardObject>): BoardObject {
  return makeObject({
    type: "status_badge",
    width: 100,
    height: 32,
    color: "#22C55E",
    ...overrides,
  })
}

export function makeSectionHeader(overrides?: Partial<BoardObject>): BoardObject {
  return makeObject({
    type: "section_header",
    width: 400,
    height: 40,
    ...overrides,
  })
}

export function makeMetricCard(overrides?: Partial<BoardObject>): BoardObject {
  return makeObject({
    type: "metric_card",
    formula: null,
    width: 160,
    height: 100,
    ...overrides,
  })
}

export function makeChecklist(overrides?: Partial<BoardObject>): BoardObject {
  return makeObject({
    type: "checklist",
    width: 200,
    height: 160,
    ...overrides,
  })
}

export function makeApiObject(overrides?: Partial<BoardObject>): BoardObject {
  return makeObject({
    type: "api_object",
    width: 180,
    height: 100,
    color: "#FEF3C7",
    ...overrides,
  })
}

export function makeTextObject(overrides?: Partial<BoardObject>): BoardObject {
  return makeObject({
    type: "text",
    width: 200,
    height: 60,
    color: "transparent",
    ...overrides,
  })
}

export function makeSlideFrame(overrides?: Partial<BoardObject>): BoardObject {
  return makeObject({
    type: "frame",
    is_slide: true,
    deck_id: null,
    slide_index: 0,
    ...overrides,
  })
}
