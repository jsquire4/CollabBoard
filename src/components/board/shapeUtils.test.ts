import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  GRID_SIZE,
  snapToGrid,
  isVectorType,
  getOutlineProps,
  getShadowProps,
  areShapePropsEqual,
  handleShapeTransformEnd,
  getInitialVertexPoints,
} from './shapeUtils'
import { makeRectangle, makeCircle, makeLine, makeObject, makeTable, resetFactory } from '@/test/boardObjectFactory'

describe('shapeUtils', () => {
  beforeEach(() => resetFactory())

  describe('snapToGrid', () => {
    it('snaps to default grid size', () => {
      expect(snapToGrid(0)).toBe(0)
      expect(snapToGrid(20)).toBe(40)
      expect(snapToGrid(39)).toBe(40)
      expect(snapToGrid(41)).toBe(40)
      expect(snapToGrid(60)).toBe(80)
    })

    it('snaps to custom grid size', () => {
      expect(snapToGrid(12, 10)).toBe(10)
      expect(snapToGrid(14, 10)).toBe(10)
      expect(snapToGrid(16, 10)).toBe(20)
    })

    it('snaps with subdivisions', () => {
      // step = 40/2 = 20
      expect(snapToGrid(5, 40, 2)).toBe(0)
      expect(snapToGrid(10, 40, 2)).toBe(20) // 10/20=0.5 rounds to 1
      expect(snapToGrid(15, 40, 2)).toBe(20)
      expect(snapToGrid(25, 40, 2)).toBe(20)
    })
  })

  describe('isVectorType', () => {
    it('returns true for line, arrow, and data_connector', () => {
      expect(isVectorType('line')).toBe(true)
      expect(isVectorType('arrow')).toBe(true)
      expect(isVectorType('data_connector')).toBe(true)
    })

    it('returns false for other types', () => {
      expect(isVectorType('rectangle')).toBe(false)
      expect(isVectorType('circle')).toBe(false)
      expect(isVectorType('sticky_note')).toBe(false)
      expect(isVectorType('group')).toBe(false)
      expect(isVectorType('frame')).toBe(false)
      expect(isVectorType('triangle')).toBe(false)
    })
  })

  describe('getOutlineProps', () => {
    it('returns selection stroke when selected', () => {
      const obj = makeRectangle({ id: 'r1' })
      expect(getOutlineProps(obj, true)).toEqual({
        stroke: '#1B3A6B',
        strokeWidth: 2,
        dash: undefined,
      })
    })

    it('returns user stroke when not selected and stroke_color set', () => {
      const obj = makeRectangle({ id: 'r1', stroke_color: '#FF0000', stroke_width: 4 })
      expect(getOutlineProps(obj, false)).toEqual({
        stroke: '#FF0000',
        strokeWidth: 4,
        dash: undefined,
      })
    })

    it('parses stroke_dash when valid JSON array', () => {
      const obj = makeRectangle({ id: 'r1', stroke_color: '#333', stroke_dash: '[5,5]' })
      expect(getOutlineProps(obj, false)).toEqual({
        stroke: '#333',
        strokeWidth: 2,
        dash: [5, 5],
      })
    })

    it('returns undefined dash when stroke_dash is invalid JSON', () => {
      const obj = makeRectangle({ id: 'r1', stroke_color: '#333', stroke_dash: 'not json' })
      expect(getOutlineProps(obj, false).dash).toBeUndefined()
    })

    it('returns undefined dash when stroke_dash is non-array JSON', () => {
      const obj = makeRectangle({ id: 'r1', stroke_color: '#333', stroke_dash: '"string"' })
      expect(getOutlineProps(obj, false).dash).toBeUndefined()
    })

    it('returns no stroke when not selected and no stroke_color', () => {
      const obj = makeRectangle({ id: 'r1' })
      expect(getOutlineProps(obj, false)).toEqual({
        stroke: undefined,
        strokeWidth: 0,
        dash: undefined,
      })
    })

    it('selection overrides user stroke', () => {
      const obj = makeRectangle({ id: 'r1', stroke_color: '#FF0000' })
      expect(getOutlineProps(obj, true).stroke).toBe('#1B3A6B')
    })
  })

  describe('getShadowProps', () => {
    it('returns defaults when null', () => {
      const obj = makeRectangle({ id: 'r1' })
      expect(getShadowProps(obj)).toEqual({
        shadowColor: 'rgba(0,0,0,0.12)',
        shadowBlur: 6,
        shadowOffsetX: 0,
        shadowOffsetY: 2,
      })
    })

    it('returns overrides when set', () => {
      const obj = makeRectangle({
        id: 'r1',
        shadow_color: '#333',
        shadow_blur: 10,
        shadow_offset_x: 3,
        shadow_offset_y: 4,
      })
      expect(getShadowProps(obj)).toEqual({
        shadowColor: '#333',
        shadowBlur: 10,
        shadowOffsetX: 3,
        shadowOffsetY: 4,
      })
    })
  })

  describe('areShapePropsEqual', () => {
    const obj = makeRectangle({ id: 'r1' })
    const base = { object: obj, isSelected: false, editable: true }

    it('returns true when all compared props match', () => {
      expect(areShapePropsEqual(base, { ...base })).toBe(true)
    })

    it('returns false when object ref differs', () => {
      const obj2 = { ...obj }
      expect(areShapePropsEqual(base, { ...base, object: obj2 })).toBe(false)
    })

    it('returns false when isSelected differs', () => {
      expect(areShapePropsEqual(base, { ...base, isSelected: true })).toBe(false)
    })

    it('returns false when editable differs', () => {
      expect(areShapePropsEqual(base, { ...base, editable: false })).toBe(false)
    })

    it('returns false when isEditing differs', () => {
      expect(areShapePropsEqual(base, { ...base, isEditing: true })).toBe(false)
    })

    it('returns false when editingField differs', () => {
      expect(areShapePropsEqual(base, { ...base, editingField: 'text' })).toBe(false)
    })
  })

  describe('handleShapeTransformEnd', () => {
    it('resets scale and reports dimensions', () => {
      const obj = makeRectangle({ id: 'r1', width: 100, height: 80 })
      const onTransformEnd = vi.fn()

      const scaleX = vi.fn()
      const scaleY = vi.fn()
      scaleX.mockReturnValueOnce(2).mockImplementation((v?: number) => (v === undefined ? 2 : undefined))
      scaleY.mockReturnValueOnce(2).mockImplementation((v?: number) => (v === undefined ? 2 : undefined))

      const mockNode = {
        scaleX,
        scaleY,
        x: vi.fn(() => 10),
        y: vi.fn(() => 20),
        rotation: vi.fn(() => 15),
      }

      const e = { target: mockNode } as unknown as Parameters<typeof handleShapeTransformEnd>[0]
      handleShapeTransformEnd(e, obj, onTransformEnd)

      expect(scaleX).toHaveBeenCalledWith(1)
      expect(scaleY).toHaveBeenCalledWith(1)
      expect(onTransformEnd).toHaveBeenCalledWith('r1', {
        x: 10,
        y: 20,
        width: 200,
        height: 160,
        rotation: 15,
      })
    })

    it('enforces min width/height of 5', () => {
      const obj = makeRectangle({ id: 'r1', width: 2, height: 2 })
      const onTransformEnd = vi.fn()

      const scaleX = vi.fn((v?: number) => (v === undefined ? 0.5 : undefined))
      const scaleY = vi.fn((v?: number) => (v === undefined ? 0.5 : undefined))

      const mockNode = {
        scaleX,
        scaleY,
        x: vi.fn(() => 0),
        y: vi.fn(() => 0),
        rotation: vi.fn(() => 0),
      }

      const e = { target: mockNode } as unknown as Parameters<typeof handleShapeTransformEnd>[0]
      handleShapeTransformEnd(e, obj, onTransformEnd)

      expect(onTransformEnd).toHaveBeenCalledWith('r1', expect.objectContaining({
        width: 5,
        height: 5,
      }))
    })

    it('scales custom_points when shape is resized', () => {
      const obj = makeRectangle({
        id: 'r1',
        width: 100,
        height: 80,
        custom_points: '[10,20,90,20,90,60,10,60]',
      })
      const onTransformEnd = vi.fn()

      const scaleX = vi.fn((v?: number) => (v === undefined ? 2 : undefined))
      const scaleY = vi.fn((v?: number) => (v === undefined ? 2 : undefined))

      const mockNode = {
        scaleX,
        scaleY,
        x: vi.fn(() => 0),
        y: vi.fn(() => 0),
        rotation: vi.fn(() => 0),
      }

      const e = { target: mockNode } as unknown as Parameters<typeof handleShapeTransformEnd>[0]
      handleShapeTransformEnd(e, obj, onTransformEnd)

      expect(onTransformEnd).toHaveBeenCalledWith('r1', expect.objectContaining({
        custom_points: '[20,40,180,40,180,120,20,120]',
      }))
    })

    it('keeps existing custom_points when parse fails', () => {
      const obj = makeRectangle({
        id: 'r1',
        width: 100,
        height: 80,
        custom_points: 'invalid json',
      })
      const onTransformEnd = vi.fn()

      const scaleX = vi.fn((v?: number) => (v === undefined ? 2 : undefined))
      const scaleY = vi.fn((v?: number) => (v === undefined ? 2 : undefined))

      const mockNode = {
        scaleX,
        scaleY,
        x: vi.fn(() => 0),
        y: vi.fn(() => 0),
        rotation: vi.fn(() => 0),
      }

      const e = { target: mockNode } as unknown as Parameters<typeof handleShapeTransformEnd>[0]
      handleShapeTransformEnd(e, obj, onTransformEnd)

      expect(onTransformEnd).toHaveBeenCalledWith('r1', expect.not.objectContaining({
        custom_points: expect.anything(),
      }))
    })

    it('distributes scale to table columns and rows', () => {
      const tableData = JSON.stringify({
        columns: [
          { id: 'c1', name: 'Col 1', width: 100 },
          { id: 'c2', name: 'Col 2', width: 100 },
        ],
        rows: [
          { id: 'r1', height: 40, cells: { c1: { text: '' }, c2: { text: '' } } },
        ],
      })
      const obj = makeTable({ id: 'tbl-1', width: 200, height: 72, table_data: tableData })
      const onTransformEnd = vi.fn()

      const scaleX = vi.fn((v?: number) => (v === undefined ? 1.5 : undefined))
      const scaleY = vi.fn((v?: number) => (v === undefined ? 2 : undefined))
      const mockNode = {
        scaleX,
        scaleY,
        x: vi.fn(() => 50),
        y: vi.fn(() => 60),
        rotation: vi.fn(() => 0),
      }

      const e = { target: mockNode } as unknown as Parameters<typeof handleShapeTransformEnd>[0]
      handleShapeTransformEnd(e, obj, onTransformEnd)

      const call = onTransformEnd.mock.calls[0]
      expect(call[0]).toBe('tbl-1')
      const updates = call[1]
      expect(updates.table_data).toBeDefined()
      const newData = JSON.parse(updates.table_data as string)
      // 100 * 1.5 = 150 for each column
      expect(newData.columns[0].width).toBe(150)
      expect(newData.columns[1].width).toBe(150)
      // 40 * 2 = 80
      expect(newData.rows[0].height).toBe(80)
      // Width should be sum of column widths
      expect(updates.width).toBe(300)
    })

    it('clamps table column widths and row heights to minimums during scale', () => {
      const tableData = JSON.stringify({
        columns: [
          { id: 'c1', name: 'Col 1', width: 60 },
        ],
        rows: [
          { id: 'r1', height: 30, cells: { c1: { text: '' } } },
        ],
      })
      const obj = makeTable({ id: 'tbl-2', width: 60, height: 62, table_data: tableData })
      const onTransformEnd = vi.fn()

      // Scale down small enough to hit minimums
      const scaleX = vi.fn((v?: number) => (v === undefined ? 0.3 : undefined))
      const scaleY = vi.fn((v?: number) => (v === undefined ? 0.3 : undefined))
      const mockNode = {
        scaleX,
        scaleY,
        x: vi.fn(() => 0),
        y: vi.fn(() => 0),
        rotation: vi.fn(() => 0),
      }

      const e = { target: mockNode } as unknown as Parameters<typeof handleShapeTransformEnd>[0]
      handleShapeTransformEnd(e, obj, onTransformEnd)

      const updates = onTransformEnd.mock.calls[0][1]
      const newData = JSON.parse(updates.table_data as string)
      // 60 * 0.3 = 18, clamped to MIN_COL_WIDTH (40)
      expect(newData.columns[0].width).toBe(40)
      // 30 * 0.3 = 9, clamped to MIN_ROW_HEIGHT (24)
      expect(newData.rows[0].height).toBe(24)
    })
  })

  describe('getInitialVertexPoints', () => {
    it('parses custom_points when present', () => {
      const obj = makeRectangle({ id: 'r1', custom_points: '[0,0,100,0,100,80,0,80]' })
      expect(getInitialVertexPoints(obj)).toEqual([0, 0, 100, 0, 100, 80, 0, 80])
    })

    it('falls through when custom_points parse fails', () => {
      const obj = makeRectangle({ id: 'r1', custom_points: 'not json', width: 100, height: 80 })
      expect(getInitialVertexPoints(obj)).toEqual([0, 0, 100, 0, 100, 80, 0, 80]) // rect strategy
    })

    it('returns rect corners for rectangle', () => {
      const obj = makeRectangle({ id: 'r1', width: 120, height: 80 })
      expect(getInitialVertexPoints(obj)).toEqual([0, 0, 120, 0, 120, 80, 0, 80])
    })

    it('returns circle approximation for circle', () => {
      const obj = makeCircle({ id: 'c1', width: 100, height: 100 })
      const pts = getInitialVertexPoints(obj)
      expect(pts.length).toBe(48) // 24 points * 2 coords
      expect(pts[0]).toBeCloseTo(50)
      expect(pts[1]).toBeCloseTo(0)
    })

    it('returns polygon points for triangle', () => {
      const obj = makeObject({ id: 't1', type: 'triangle', width: 100, height: 90 })
      expect(getInitialVertexPoints(obj)).toEqual([50, 0, 100, 90, 0, 90])
    })

    it('returns empty for type not in registry', () => {
      const obj = makeObject({ id: 'x1', type: 'sticky_note', width: 100, height: 100 })
      // sticky_note has no polygon/rect/circle strategy in registry
      expect(getInitialVertexPoints(obj)).toEqual([])
    })
  })
})
