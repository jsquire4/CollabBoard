import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { BoardMutationsProvider, useBoardMutations } from './BoardMutationsContext'

function makeMutationsValue(overrides?: Record<string, unknown>) {
  const noop = vi.fn()
  const ref = { current: new Map<string, number[]>() }
  return {
    onDrawShape: noop,
    onCancelTool: noop,
    onSelect: noop,
    onSelectObjects: noop,
    onClearSelection: noop,
    onEnterGroup: noop,
    onExitGroup: noop,
    onDragStart: noop,
    onDragEnd: noop,
    onDragMove: noop,
    onUpdateText: noop,
    onUpdateTitle: noop,
    onTransformEnd: noop,
    onDelete: noop,
    onDuplicate: noop,
    onCopy: noop,
    onCut: noop,
    onPaste: noop,
    onColorChange: noop,
    onStrokeStyleChange: noop,
    onOpacityChange: noop,
    onMarkerChange: noop,
    onBringToFront: noop,
    onBringForward: noop,
    onSendBackward: noop,
    onSendToBack: noop,
    onGroup: noop,
    onUngroup: noop,
    canGroup: false,
    canUngroup: false,
    onUndo: noop,
    onRedo: noop,
    onCheckFrameContainment: noop,
    onMoveGroupChildren: noop,
    recentColors: [],
    colors: [],
    onEndpointDragMove: noop,
    onEndpointDragEnd: noop,
    onDrawLineFromAnchor: noop,
    onCursorMove: noop,
    onCursorUpdate: noop,
    onEditingChange: noop,
    anySelectedLocked: false,
    onLock: noop,
    onUnlock: noop,
    canLock: false,
    canUnlock: false,
    onEditVertices: noop,
    onExitVertexEdit: noop,
    onVertexDragEnd: noop,
    onVertexInsert: noop,
    canEditVertices: false,
    onActivity: noop,
    pendingEditId: null,
    onPendingEditConsumed: noop,
    onWaypointDragEnd: noop,
    onWaypointInsert: noop,
    onWaypointDelete: noop,
    autoRoutePointsRef: ref,
    onUpdateTableCell: noop,
    onTableDataChange: noop,
    onAddRow: noop,
    onDeleteRow: noop,
    onAddColumn: noop,
    onDeleteColumn: noop,
    onAddRowAt: noop,
    onDeleteRowAt: noop,
    onAddColumnAt: noop,
    onDeleteColumnAt: noop,
    snapIndicator: null,
    vertexEditId: null,
    ...overrides,
  }
}

describe('BoardMutationsContext', () => {
  it('throws when used outside provider', () => {
    expect(() => {
      renderHook(() => useBoardMutations())
    }).toThrow('useBoardMutations must be used within a BoardMutationsProvider')
  })

  it('returns context value when inside provider', () => {
    const value = makeMutationsValue({ canGroup: true, canUngroup: true })
    const { result } = renderHook(() => useBoardMutations(), {
      wrapper: ({ children }) => (
        <BoardMutationsProvider value={value}>{children}</BoardMutationsProvider>
      ),
    })

    expect(result.current.canGroup).toBe(true)
    expect(result.current.canUngroup).toBe(true)
    expect(result.current.pendingEditId).toBeNull()
    expect(result.current.vertexEditId).toBeNull()
    expect(result.current.snapIndicator).toBeNull()
  })

  it('mutation callbacks are callable', () => {
    const onDelete = vi.fn()
    const onDuplicate = vi.fn()
    const value = makeMutationsValue({ onDelete, onDuplicate })
    const { result } = renderHook(() => useBoardMutations(), {
      wrapper: ({ children }) => (
        <BoardMutationsProvider value={value}>{children}</BoardMutationsProvider>
      ),
    })

    // Actually call mutations and verify they propagate
    result.current.onDelete()
    result.current.onDuplicate()
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onDuplicate).toHaveBeenCalledTimes(1)
  })
})
