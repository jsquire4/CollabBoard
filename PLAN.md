# Implementation Plan: Table Shape

## Chosen Approach

Single `board_objects` row with `table_data` JSONB column. Konva Group-per-cell rendering with invisible resize handles. Cell editing via `useTextEditing` extension with `editingCellCoords`. Pure TDD: write all tests first (red), then implement (green). Based on the verified TODO.md plan with Konva performance optimizations from research.

## 1. Testing Strategy

### Test-First (Red Phase) — Written Before Implementation

All test files are written first so every implementation task has a clear "green" target.

| Test File | Tests | What It Covers |
|-----------|-------|----------------|
| `src/lib/table/tableUtils.test.ts` | 38 | All pure utility functions — CRUD, resize, navigation, serialization |
| `src/hooks/board/useTableActions.test.ts` | 12 | Action hook — add/delete row/col, cell update, undo, canEdit guard |
| `src/hooks/board/useTextEditing.test.ts` | +8 | Cell editing start/finish, Tab/Enter/Escape nav, coords cleared |
| `src/hooks/board/usePersistence.test.ts` | +3 | addObject table, updateObject table_data, duplicateObject table |
| `src/components/board/shapeUtils.test.ts` | +2 | Transform distribution for tables |
| `src/hooks/board/useTableIntegration.test.ts` | 6 | Cross-hook: delete/duplicate/color/group/transform |

**Total: 69 new tests** across 6 test files (3 new, 3 existing).

### Test Infrastructure Needed
- `src/test/boardObjectFactory.ts` — add `makeTable(overrides?)` factory function
- No new test utilities or mocks needed — existing `makeDeps()` pattern covers everything

### Acceptance Criteria
- All 69 new tests pass
- All existing ~639 tests still pass
- `npx tsc --noEmit` clean
- No regressions in shape rendering, editing, or persistence

## 2. Implementation Plan

### Task Breakdown (Ordered with Dependencies)

#### Round 1 — Foundation (3 parallel tasks, no shared files)

**Task 1A: Types + Pure Utilities**
- Create `src/lib/table/tableTypes.ts` — `TableCell`, `TableColumn`, `TableRow`, `TableData`, constants
- Create `src/lib/table/tableUtils.ts` — 17 pure functions (all immutable, return new objects)
- Create `src/lib/table/tableUtils.test.ts` — 38 tests
- **Target:** tableUtils.test.ts all green

**Task 1B: BoardObject Type Extension + Test Factory**
- Edit `src/types/board.ts` — add `'table'` to `BoardObjectType` union, add `table_data?: string | null` to `BoardObject`
- Edit `src/test/boardObjectFactory.ts` — add `makeTable(overrides?)` factory
- **Target:** Types compile, factory usable in later tests

**Task 1C: Database Migration**
- Create `supabase/migrations/20260219100000_add_table_type.sql`
- `ALTER TABLE board_objects ADD COLUMN IF NOT EXISTS table_data JSONB`
- Drop + recreate type CHECK constraint to include `'table'` (dynamic `pg_constraint` lookup, same pattern as ngon migration)
- **Target:** Migration file ready for deployment

#### Round 2 — Persistence + Action Hook (2 parallel tasks)

**Task 2A: Persistence Layer + Tests**
- Edit `src/hooks/board/usePersistence.ts`:
  - Add `'table_data'` to `BOARD_OBJECT_COLUMNS`
  - Add `table` entry to `manualDefaults`: `{ width: 360, height: 128, color: '#FFFFFF', text: '' }`
- Add 3 tests to `src/hooks/board/usePersistence.test.ts`
- **Target:** Persistence tests green

**Task 2B: useTableActions Hook + Tests**
- Create `src/hooks/board/useTableActions.ts` — follows `useStyleActions` pattern
- Create `src/hooks/board/useTableActions.test.ts` — 12 tests
- **Deps interface:** `objects`, `selectedIds`, `canEdit`, `updateObject`, `undoStack`
- **Returns:** `handleAddRow`, `handleDeleteRow`, `handleAddColumn`, `handleDeleteColumn`, `handleTableDataChange`, `handleCellTextUpdate`
- Each handler: `canEdit` guard → parse `table_data` → capture before-state → call pure util → `updateObject` with `{ table_data, width, height }` → push undo
- **Target:** useTableActions.test.ts all green

#### Round 3 — Cell Editing + Transform (2 parallel tasks)

**Task 3A: useTextEditing Extension + Tests**
- Edit `src/hooks/board/useTextEditing.ts`:
  - Add state: `editingCellCoords: { row: number; col: number } | null`
  - Add to deps: `onUpdateTableCell?: (id: string, row: number, col: number, text: string) => void`
  - Add `handleStartCellEdit(id, textNode, row, col)` — sets editingId + editingCellCoords, positions textarea
  - Add `handleCellKeyDown(e)` — Tab/Shift+Tab (→/← cell), Enter (↓ cell), Escape (finish)
  - Modify `handleFinishEdit` — call `onUpdateTableCell` when `editingCellCoords` set, then clear coords
- Edit `src/components/board/renderShape.tsx`:
  - Add `editingCellCoords?: { row: number; col: number } | null` to `ShapeState`
  - Add `handleStartCellEdit?` and `handleTableDataChange?` to `ShapeCallbacks`
- Add 8 tests to `src/hooks/board/useTextEditing.test.ts`
- **Target:** Cell editing tests green

**Task 3B: Transform Distribution + Tests**
- Edit `src/components/board/shapeUtils.ts`:
  - Add table branch in `handleShapeTransformEnd` — call `distributeScale()`, compute width/height, reset scale to 1
- Add 2 tests to `src/components/board/shapeUtils.test.ts`
- **Target:** Transform tests green

#### Round 4 — TableShape Component (1 task, builds on Rounds 1-3)

**Task 4A: TableShape Konva Component**
- Create `src/components/board/TableShape.tsx`
- **Konva structure:**
  - `<Group>` root — draggable, positioned at obj.x/y
  - `<Rect>` background — white fill, rounded corners, shadow via `getShadowProps`
  - Header row: `<Rect>` per header cell (gray bg) + `<Text>` per column name
  - Body: `<Rect>` per cell (optional bg_color) + `<Text>` per cell text
  - Grid lines: `<Line>` per row/column boundary
  - Column resize handles: invisible `<Rect>` (6px wide, full height), cursor `col-resize`
  - Row resize handles: invisible `<Rect>` (full width, 6px tall), cursor `row-resize`
- **Performance optimizations (from research):**
  - `listening={false}` on all decorative Rects and Lines (grid lines, cell backgrounds)
  - `perfectDrawEnabled={false}` on all cell Text nodes
  - `transformsEnabled="position"` on cell Text nodes (no rotation/scale needed)
  - Name-based event delegation: `name="cell:${rowIdx}:${colIdx}"` on interactive cell rects
  - `.cache()` on the Group when not editing (invalidate on table_data change)
- **Key behaviors:**
  - Double-click cell → `onStartCellEdit(id, textNode, row, col)` — find Text node by name
  - During editing: hide cell's `<Text>` (StickyNote pattern)
  - Column/row resize via drag on invisible handles → `onTableDataChange`
  - `React.memo` with `areShapePropsEqual` comparator
  - Outline via `getOutlineProps`, shadow via `getShadowProps`
- **Target:** Component renders, editing and resize work

#### Round 5 — Wiring (1 task, touches many files but all are edits)

**Task 5A: Wire Everything Together**

| File | Changes |
|------|---------|
| `renderShape.tsx` | Add `case 'table':` → `<TableShape>` with cell editing + table data props |
| `shapePresets.ts` | Add `TABLE_PRESET` (dbType: `'table'`, grid SVG icon, 360×128 default) |
| `ShapeIcon.tsx` | Add `case 'table':` — grid SVG (rect + horizontal/vertical lines) |
| `LeftToolbar.tsx` | Add `'table'` to `BASICS_IDS`, add TABLE_PRESET button in Basics flyout |
| `ContextMenu.tsx` | Add `isTable` boolean + conditional table section (Add/Delete Row/Column) |
| `BoardClient.tsx` | Import `useTableActions`, wire handlers to Canvas + ContextMenu, pass `onUpdateTableCell` to `useTextEditing` |
| `Canvas.tsx` | Pass `editingCellCoords` + `handleStartCellEdit` + `handleCellKeyDown` through to renderShape + CanvasOverlays |

- **Target:** Table creatable from toolbar, editable, resizable, context menu works

#### Round 6 — Integration Tests (1 task)

**Task 6A: Integration Tests**
- Create `src/hooks/board/useTableIntegration.test.ts` — 6 tests:
  - Delete table via `useClipboardActions` captures snapshot for undo
  - Duplicate table via `useClipboardActions` clones `table_data`
  - Color/opacity change on table via `useStyleActions`
  - Table in group: group/ungroup preserves `table_data`
  - Table transform distributes scale correctly
  - Cell editing round-trip (start → type → finish → verify)
- **Target:** All 69 new tests + all existing tests pass

## 3. Error Handling

### Failure Modes

| Failure | Where | Handling |
|---------|-------|----------|
| `table_data` JSON parse failure | `parseTableData()` | Returns `null`, `TableShape` renders empty state, logs warning |
| DB write failure on cell edit | `useTableActions` → `updateObject` → `usePersistence` | Existing `retryWithRollback` handles it — optimistic local update, rollback + toast on failure |
| DB write failure on resize | Same path | Same handling |
| Oversized table broadcast (>64KB) | `queueBroadcast` | Existing chunking in `broadcastChanges` handles it — warn at 50KB, auto-chunk at 64KB |
| Cell text exceeds limit | `setCellText()` | Truncate to `TABLE_CELL_CHAR_LIMIT` (256 chars) |
| Column/row count explosion | `addColumn`/`addRow` | No hard cap now, but `distributeScale` + `getTableWidth/Height` keep dimensions sane. Future: add MAX_COLUMNS=50, MAX_ROWS=100 constants |
| Invalid resize (below minimum) | `resizeColumn`/`resizeRow` | Clamp to `MIN_COL_WIDTH`/`MIN_ROW_HEIGHT` |
| Concurrent edit conflict | CRDT | `table_data` is atomic JSONB — last writer wins on the whole field. This is acceptable for v1 (cell-level CRDT is a future optimization) |
| Double-click on resize handle | Event handling | Name-based delegation: resize handles have distinct names from cell rects, no ambiguity |

### Error Boundaries
- Parse errors caught in `parseTableData()` — returns null, component renders gracefully
- All DB writes go through existing `retryWithRollback`/`fireAndRetry` — no new error paths
- Transform errors caught in `handleShapeTransformEnd` table branch — clamp values, never produce NaN

### User-Facing Errors
- Cell edit fail: toast "Failed to save changes. Please try again." (existing pattern)
- Table creation fail: toast "Failed to create table." (existing pattern via `addObject`)
- No new error UI needed

## 4. Execution Strategy

### Parallelization Map

```
Round 1: [1A: Types+Utils] [1B: Type Extension] [1C: Migration]  ← 3 parallel
Round 2: [2A: Persistence]  [2B: useTableActions]                 ← 2 parallel
Round 3: [3A: Cell Editing]  [3B: Transform]                      ← 2 parallel
Round 4: [4A: TableShape]                                         ← 1 sequential
Round 5: [5A: Wiring]                                             ← 1 sequential
Round 6: [6A: Integration Tests]                                  ← 1 sequential
```

**Why Rounds 4-6 are sequential:** TableShape depends on all prior types, utilities, and interfaces. Wiring depends on TableShape. Integration tests depend on everything wired.

### Commit Strategy
- One commit per round (6 commits total for implementation)
- Additional commits for quality loop fixes
- All on `feat/canvas-tables` branch (already exists, currently at main)

### Performance Considerations
- Tables with >20 rows should use `.cache()` on the Konva Group when not being edited
- Invalidate cache on: `table_data` change, selection, editing start/end
- Cell Text nodes: `perfectDrawEnabled={false}` + `transformsEnabled="position"`
- Decorative nodes (grid lines, cell bg rects): `listening={false}`
- Future optimization: viewport virtualization for tables >50 rows (not in this plan)

### Incremental Delivery
- After Round 4: tables are renderable and editable (manual testing possible)
- After Round 5: fully integrated — can be used end-to-end
- After Round 6: test coverage complete

## 5. Definition of Done

- [ ] All 69 new tests passing
- [ ] All existing ~639 tests still passing
- [ ] `npx tsc --noEmit` clean
- [ ] Error handling covers all identified failure modes
- [ ] Konva performance optimizations applied (listening, perfectDrawEnabled, transformsEnabled)
- [ ] Code reviewed (via /audit)
- [ ] Retrospective completed (via /retrospective)
- [ ] Lessons learned updated
