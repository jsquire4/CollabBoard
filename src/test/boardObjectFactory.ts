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

/** Build an objects Map from an array */
export function objectsMap(...objs: BoardObject[]): Map<string, BoardObject> {
  return new Map(objs.map(o => [o.id, o]))
}
