# Implementation Plan: Full Complexity Sweep Refactoring

## Chosen Approach

Types-first, architecture-second execution across 5 phases and 12 consolidation targets. The type system acts as the specification — discriminated unions and sub-interfaces create compiler-enforced guardrails that prevent complexity from re-accumulating. Context architecture eliminates prop-threading as the default pattern. Everything else follows.

**Branch:** `refactor/complexity-sweep` (already created)

**Version Control:** Commit after every logical unit. `npx tsc --noEmit` before every commit. Each phase ends with a full `npx tsc --noEmit && npm run test` checkpoint. If a phase goes sideways, `git revert` that phase's commits back to the last checkpoint.

---

## 1. Testing Strategy

> **Current regime:** See `CLAUDE.md` and `README.md` for the full testing index. Summary: `npm run test` (unit), `npm run test:stress` (CRDT/undo/reconnect), `npm run test:e2e` (smoke), `npm run test:e2e:stress` (performance + multi-user load), `npm run test:all` (full suite).

### Existing Safety Net (Unit)

| Test File | Covers |
|-----------|--------|
| `usePersistence.test.ts` | All 11 persistence operations, reconnect reconciliation |
| `useBoardState.test.ts` | State mutations, group/ungroup, z-order, broadcast coalescing |
| `useConnectorActions.test.ts` | Anchor snap, endpoint drag, connector creation |
| `useTableActions.test.ts` | Table cell/row/col mutations |
| `useKeyboardShortcuts.test.ts` | All shortcut keys, editing guard |
| `useBroadcast.test.ts` | Broadcast batching, coalescing, flush |
| `useStyleActions.test.ts` | Color, stroke, opacity, markers |
| `boardsApi.test.ts` | Board CRUD, sharing, invite acceptance |
| `shapeUtils.test.ts` | Transform, snap, outline/shadow props |
| `BoardList.test.tsx` | Board list rendering, duplication |
| `BoardContext.test.tsx` | Provider/consumer contract |
| `src/lib/crdt/*.test.ts` | Merge, HLC, dispatch-logic, edge-function-parity |
| `*.stress.test.ts` | CRDT 500-object convergence, useBoardState bulk, usePersistence reconnect, useUndoExecution undo |

### New Tests Required (by priority)

1. **`useUndoExecution.test.ts`** — Currently ZERO coverage for `executeUndo` (91 lines, 7 entry types). Must cover all undo/redo paths for: add, delete, update, move, duplicate, group, ungroup. **TDD candidate.**
2. **`BoardStateContext.test.tsx` / `BoardMutationsContext.test.tsx` / `BoardToolContext.test.tsx`** — Throw-outside-provider guard + field accessibility for each split context. **TDD candidate.**
3. **`useObjectLoader.test.ts` / `useObjectWriter.test.ts` / `useDragPersistence.test.ts`** — Sub-hook coverage after usePersistence split.
4. **`ContextMenu.test.tsx`** — Currently no tests for a 490-line, 39-prop component being refactored.
5. **`useClickOutside.test.ts`** — Hook exists, test does not.
6. **`useSyncRef.test.ts`** — Pure hook, trivial TDD.
7. **`getUserDisplayName.test.ts`** — Pure function.
8. **Geometry migration tests** — Import path changes only; migrate existing tests from `shapePresets.test.ts`.

### Test Infrastructure Changes

1. **`src/test/renderWithBoardContext.tsx`** — Shared wrapper for all three split contexts. Prevents every component test from duplicating the three-provider wrapping.
2. **`src/test/mocks/supabase.ts`** — Centralize `chainMock` helper (currently duplicated inline across test files).
3. **`src/test/boardObjectFactory.ts`** — Add typed factory functions for discriminated union variants (`makeConnector`, `makeNgon`, `makeLockedRectangle`).

### Verification Checkpoints

| After Phase | Commands |
|---|---|
| Phase 1 | `npx tsc --noEmit && npm run test` |
| Phase 2 | `npx tsc --noEmit && npm run test && npm run test:stress` |
| Phase 3 | `npx tsc --noEmit && npm run test` — `usePersistence.test.ts` must still pass |
| Phase 4 | `npx tsc --noEmit && npm run test` |
| Phase 5 | `npx tsc --noEmit && npm run test && npx next build` |

### Acceptance Criteria

- Zero regressions: all existing tests pass, no tests deleted
- Zero `// @ts-ignore` or `as any` introduced
- `useUndoExecution.test.ts` covers all 7 UndoEntry types for both undo and redo
- Every new module with non-trivial logic has a co-located test file
- Production build succeeds: `npx next build`

---

## 2. Implementation Plan

### Phase 1: Type System as Specification

**Goal:** Group BoardObject's 50+ fields into typed sub-interfaces. Non-breaking intersection type preserves all 44 consumer imports.

**Create:**
- `src/types/boardObject.ts` — 10 sub-interfaces + composed `BoardObject`:
  - `BoardObjectIdentity` (id, board_id, type, created_by, timestamps)
  - `BoardObjectGeometry` (x, y, x2, y2, width, height, rotation)
  - `BoardObjectHierarchy` (z_index, parent_id)
  - `BoardObjectText` (text, title, rich_text, font_size, font_family, font_style, text_align, text_vertical_align, text_padding, text_color)
  - `BoardObjectAppearance` (color, stroke_color, stroke_width, stroke_dash, opacity, corner_radius, shadow_*)
  - `BoardObjectConnector` (connect_start/end_id, connect_start/end_anchor, waypoints, marker_start/end)
  - `BoardObjectPolygon` (sides, custom_points)
  - `BoardObjectTable` (table_data)
  - `BoardObjectFile` (storage_path, file_name, mime_type, file_size)
  - `BoardObjectCollab` (locked_by, field_clocks, deleted_at)
  - `type BoardObject = Identity & Geometry & Hierarchy & Text & Appearance & Connector & Polygon & Table & File & Collab`

**Modify:**
- `src/types/board.ts` — Remove `BoardObject` interface, add `export type { BoardObject } from './boardObject'` re-export
- `src/test/boardObjectFactory.ts` — Update factory to build sub-interface categories

**Task order:** Write boardObject.ts → Update board.ts re-export → Update factory → `tsc --noEmit`

---

### Phase 2: Context Architecture

**Goal:** Split `BoardContext` into 3 focused contexts. Eliminate Canvas's 75-prop interface. Delete `CanvasOverlays`.

**Create:**
- `src/contexts/BoardStateContext.tsx` — Read-only state (current 20 fields from BoardContext)
- `src/contexts/BoardMutationsContext.tsx` — All mutation callbacks (currently threaded as Canvas props: ~55 callbacks for drawing, selection, drag, text, transform, clipboard, style, z-order, groups, lock, connectors, vertices, undo, tables, settings, cursor/activity)
- `src/contexts/BoardToolContext.tsx` — Lightweight tool state (activeTool, activePreset, vertexEditId, canEditVertices)
- `src/components/board/TextareaOverlay.tsx` — Extracted from CanvasOverlays lines 101-133 (textarea char-limit routing + escape/blur handling)
- `src/components/board/ConnectorHintButton.tsx` — Extracted from CanvasOverlays lines 135-186 (positioned button with ref mutations)

**Modify:**
- `src/contexts/BoardContext.tsx` — Becomes backward-compat shim re-exporting `BoardStateContext` (removed in Phase 5)
- `src/components/board/Canvas.tsx` — Remove 75-prop `CanvasProps` interface. Read mutations from `useBoardMutationsContext()`. Remove CanvasOverlays render, replace with `<TextareaOverlay>` + `<ConnectorHintButton>`
- `src/components/board/BoardClient.tsx` — Add `<BoardMutationsProvider>` wrapping. Remove all prop-threading to Canvas (lines 789-864 become just `<Canvas />`)
- `src/components/board/ContextMenu.tsx` — Reduce from 39 props to ~3 (`position`, `objectId`, `onClose`). Read everything else from contexts.

**Delete:**
- `src/components/board/CanvasOverlays.tsx`

**Task order:** Create 3 contexts → Update BoardContext shim → Extract TextareaOverlay + ConnectorHintButton → Update ContextMenu → Update Canvas → Update BoardClient → Delete CanvasOverlays → `tsc --noEmit`

**Key constraints:**
- Canvas already reads 19 fields from `useBoardContext()` — those migrate to `useBoardStateContext()` seamlessly
- ContextMenu reads `objects.get(objectId)` from context to derive `isLine`, `isTable`, current style values
- Konva refs (`shapeRefs`, `trRef`, `stageRef`) stay in Canvas — they cannot go in context (imperative Konva lifecycle, SSR safety)

---

### Phase 3: Hook Decomposition

**Goal:** Split usePersistence into focused sub-hooks. Extract connection manager, grid settings, undo execution from BoardClient. Unify text editing hooks. Move group persistence. Parameterize z-order.

**Create:**
- `src/hooks/board/usePersistenceCore.ts` — `loadObjects`, `reconcileOnReconnect`, `waitForPersist`. Owns `persistPromisesRef`.
- `src/hooks/board/usePersistenceWrite.ts` — `addObject`, `addObjectWithId`, `updateObject`, `deleteObject`. Receives `persistPromisesRef` from core.
- `src/hooks/board/usePersistenceDrag.ts` — `updateObjectDrag`, `updateObjectDragEnd`, `moveGroupChildren`.
- `src/hooks/board/usePersistenceComposite.ts` — `duplicateObject` (calls `addObject`), `persistZIndexBatch`.
- `src/hooks/board/useGroupPersistence.ts` — `groupSelected`, `ungroupSelected` (moved from useBoardState where they bypass usePersistence and directly call supabase).
- `src/hooks/board/useConnectionManager.ts` — Reconnect state machine extracted from BoardClient (3 refs: `hasConnectedRef`, `reconnectTimerRef`, `reconnectAttemptRef` + `connectionStatus` state + reconnect logic with exponential backoff + auth expiry detection).
- `src/hooks/board/useGridSettings.ts` — 8 grid useState calls consolidated into single `useReducer` + persist-on-change via `fireAndRetry`.
- `src/hooks/board/useUndoExecution.ts` — `executeUndo` (91 lines, 7 entry types) + `performUndo` + `performRedo`. Colocated with undo domain. **Closes over:** `objects`, `deleteObject`, `addObjectWithId`, `updateObject`, `getDescendants`.
- `src/hooks/board/useUnifiedTextEditing.ts` — Merges `useTextEditing` + `useRichTextEditing`. Calls both unconditionally (React hook rules), selects return value based on `RICH_TEXT_ENABLED` flag.

**Modify:**
- `src/hooks/board/usePersistence.ts` — Becomes thin orchestrator calling 4 sub-hooks, merging returns. Backward-compatible API preserved for useBoardState.
- `src/hooks/useBoardState.ts` — Remove `groupSelected`/`ungroupSelected` (moved to useGroupPersistence). Extract `applyZOrderSwap()` helper to parameterize `bringForward`/`sendBackward` (eliminates ~90 duplicate lines).
- `src/components/board/BoardClient.tsx` — Replace connection state machine with `useConnectionManager`. Replace 8 grid useState with `useGridSettings`. Replace executeUndo/performUndo/performRedo with `useUndoExecution`. **BoardClient drops from ~897L to ~450L.**
- `src/components/board/Canvas.tsx` — Replace dual useTextEditing/useRichTextEditing with `useUnifiedTextEditing`.

**Key constraints:**
- `persistPromisesRef` is a single instance created in `usePersistenceCore`, passed by reference to `usePersistenceWrite`. Do NOT create in multiple places.
- `useUnifiedTextEditing` calls both hooks unconditionally (React hook rules prohibit conditional hooks), selects return value.
- `channel.subscribe()` must remain the last call in BoardClient's useEffect. `useConnectionManager` preserves this ordering by accepting the channel as a prop.
- `useGroupPersistence` receives `updateObject` as a parameter to avoid circular dep with `usePersistenceWrite`.

**Task order (with internal parallelism):**
- Agent A: Split usePersistence (core → write → drag → composite → orchestrator)
- Agent B: useConnectionManager + useGridSettings (from BoardClient)
- Agent C: useUndoExecution (TDD: tests first, then extraction)
- Agent D: useUnifiedTextEditing
- Agent E: useGroupPersistence + z-order parameterization
- Sequential after all agents: Update BoardClient + Canvas

---

### Phase 4: Shared Utilities

**Goal:** Extract shared hooks and utilities. Eliminate all copy-paste patterns.

**Create:**
- `src/hooks/useSyncRef.ts` — Replaces 6x `useRef` + `useEffect` boilerplate in useRichTextEditing. Signature: `useSyncRef<T>(value: T): React.RefObject<T>`.
- `src/hooks/useFlyoutPosition.ts` — Replaces duplicated flyout positioning in LeftToolbar's ToolGroupButton and NgonGroupButton (byte-for-byte identical 18-line useEffect). Returns `{ containerRef, panelRef, panelPos }`.
- `src/hooks/usePopover.ts` — Replaces duplicated compact popover pattern in StylePanel and FontSelector (with rAF viewport-clamp divergence fixed). Uses `useClickOutside` internally.
- `src/lib/textConstants.ts` — `TEXTAREA_BASE_STYLE` constant (`position: absolute`, `background: transparent`, `border: none`, `outline: none`, `resize: none`, `overflow: hidden`, `padding: 0`, `margin: 0`, `zIndex: 100`).
- `src/lib/userUtils.ts` — `getUserDisplayName(user)` replacing duplicated `full_name ?? email.split('@')[0] ?? 'Unknown'` chain.

**Modify:**
- `src/hooks/board/useRichTextEditing.ts` — 6 ref-sync pairs → 6 `useSyncRef()` calls (12 lines removed, 6 added)
- `src/components/board/LeftToolbar.tsx` — ToolGroupButton + NgonGroupButton use `useFlyoutPosition`
- `src/components/board/StylePanel.tsx` — Use `usePopover` (with rAF viewport-clamp)
- `src/components/board/FontSelector.tsx` — Use `usePopover` (fixes missing rAF viewport-clamp bug)
- `src/components/board/BoardTopBar.tsx` — Replace 2x manual `document.addEventListener('mousedown')` with `useClickOutside` + add Escape key handling
- `src/hooks/board/useTextEditing.ts` — Use `TEXTAREA_BASE_STYLE`
- `src/hooks/board/useRichTextEditing.ts` — Use `TEXTAREA_BASE_STYLE`
- `src/app/board/[id]/page.tsx` — Use `getUserDisplayName()`
- `src/components/boards/BoardsHeader.tsx` — Use `getUserDisplayName()`

**All extractions are independent — fully parallelizable within phase.**

---

### Phase 5: Shape System + Final Type Tightening

**Goal:** Extract geometry helpers. Split ShapeCallbacks. Clean VectorShape. Move table transform. Final type narrowing.

**Create:**
- `src/lib/geometry/starPoints.ts` — `computeStarPoints` (from shapePresets.ts lines 38-60)
- `src/lib/geometry/customPoints.ts` — `scaleCustomPoints` (from shapePresets.ts lines 555+), `getInitialVertexPoints` (from shapeUtils.ts)
- `src/lib/geometry/bbox.ts` — `getGroupBoundingBox`, `isObjectInViewport` (pure functions from Canvas.tsx lines 434-478)
- `src/lib/geometry/waypoints.ts` — `buildWaypointSegments` (extracted from VectorShape IIFE, lines 275-327)
- `src/lib/geometry/index.ts` — Barrel export
- `src/lib/table/tableTransform.ts` — Table-specific transform logic from shapeUtils.ts lines 120-148
- `src/components/board/WaypointAddButton.tsx` — Extracted from VectorShape IIFE JSX (midpoint add-waypoint circles)
- `src/components/board/renderShape/types.ts` — Split interfaces: `BaseShapeCallbacks` (9 universal), `VectorShapeCallbacks` (7 vector-specific), `TableShapeCallbacks` (6 table-specific)
- `src/components/board/renderShape/index.tsx` — Slimmed `renderShape()` function

**Modify:**
- `src/components/board/shapePresets.ts` — Remove `computeStarPoints`, `scaleCustomPoints`; import from `lib/geometry/`
- `src/components/board/shapeUtils.ts` — Remove table branch from `handleShapeTransformEnd`, remove `getInitialVertexPoints`; import from respective lib modules
- `src/components/board/VectorShape.tsx` — Remove IIFE, use `buildWaypointSegments()` + `<WaypointAddButton>`
- `src/components/board/Canvas.tsx` — Use `lib/geometry/bbox.ts` for group bounding box + viewport culling

**Final type tightening:**
- `src/types/boardObject.ts` — Add narrowed types:
  - `VectorObject = BoardObjectIdentity & BoardObjectGeometry & BoardObjectHierarchy & BoardObjectAppearance & Required<BoardObjectConnector> & { type: 'line' | 'arrow' }`
  - `TableObject = ... & Required<BoardObjectTable> & { type: 'table' }`
  - `FileObject = ... & Required<BoardObjectFile> & { type: 'file' }`
  - `GenericObject = ... & { type: 'sticky_note' | 'rectangle' | 'circle' | 'frame' | 'group' | 'triangle' | 'chevron' | 'parallelogram' | 'ngon' }`
- Update 6 key consumers that benefit from narrowing: VectorShape, TableShape, renderShape, usePersistenceWrite, anchorPoints, autoRoute
- Remove `BoardContext.tsx` backward-compat shim

**Delete:**
- `src/components/board/renderShape.tsx` (replaced by `renderShape/` directory)

**Task order (with internal parallelism):**
- Agent A: lib/geometry/ extractions + tests
- Agent B: ShapeCallbacks split + renderShape directory
- Agent C: VectorShape cleanup (buildWaypointSegments + WaypointAddButton)
- Agent D: Table transform extraction
- Sequential after all agents: Final type tightening + remove BoardContext shim

---

## 3. Error Handling

### Failure Modes During Refactoring

| Risk | Impact | Mitigation |
|------|--------|------------|
| Type intersection doesn't match flat interface | All 44 consumers break | Verify with `tsc --noEmit` immediately after Phase 1 before proceeding |
| Context split breaks hook registration order | Realtime channel fails to connect | Preserve `channel.subscribe()` as last call in BoardClient; test connection manually |
| usePersistence split breaks `persistPromisesRef` sharing | `waitForPersist` hangs forever | Single ref instance in usePersistenceCore, passed by reference to write sub-hook |
| `executeUndo` extraction misses a closure variable | Undo silently fails for one entry type | TDD: write useUndoExecution tests for all 7 types BEFORE extracting |
| CanvasOverlays deletion breaks textarea editing | Can't edit text on shapes | Extract TextareaOverlay BEFORE deleting CanvasOverlays; manual smoke test |
| React hook rule violation in useUnifiedTextEditing | Runtime crash | Call both hooks unconditionally, select return value (never conditional hooks) |
| Circular dependency useGroupPersistence <-> usePersistenceWrite | Build fails | useGroupPersistence receives `updateObject` as a parameter, not an import |
| BoardObject type narrowing breaks runtime code | Shapes don't render | Keep `BoardObject` as the union (backward-compat); narrow only in files that benefit |

### Rollback Strategy

Each phase produces independent commits on the feature branch:
- **Phase fails type-check:** `git revert` the phase's commits, investigate, retry
- **Phase fails tests:** Fix in-place (most likely import path issues), re-commit
- **Phase introduces runtime bug:** Identified by manual testing after each phase. Revert phase, add regression test, retry.
- **Nuclear option:** `git reset --hard` to the commit before the phase. Maximum loss = one phase of work.

---

## 4. Execution Strategy

### Parallelization Map

```
Phase 1: Types                              [SEQUENTIAL — foundation]
  4 tasks, ~30 min agent work

Phase 2: Context Architecture               [SEQUENTIAL — depends on Phase 1]
  10 tasks, ~60 min agent work

Phase 3: Hook Decomposition                 [INTERNAL PARALLELISM — 5 agents]
  Agent A: Split usePersistence (core/write/drag/composite)
  Agent B: useConnectionManager + useGridSettings
  Agent C: useUndoExecution (TDD)
  Agent D: useUnifiedTextEditing
  Agent E: useGroupPersistence + z-order parameterization
  Then sequential: Update BoardClient + Canvas

Phase 4: Shared Utilities                   [FULLY PARALLEL — all independent]
  6 independent extractions, each ~15 min

Phase 5: Shape System + Final              [INTERNAL PARALLELISM — 4 agents]
  Agent A: lib/geometry/ extractions + tests
  Agent B: ShapeCallbacks split + renderShape directory
  Agent C: VectorShape cleanup
  Agent D: Table transform extraction
  Then sequential: Final type tightening
```

### Cross-Phase Dependency DAG

```
Phase 1 (Types)
  └─> Phase 2 (Contexts) — needs stable BoardObject
      └─> Phase 3 (Hooks) — needs BoardMutationsContext
          └─> Phase 5 (Shape System + Type Tightening)

Phase 4 (Utilities) — can run in parallel with Phase 3 (no blockers)
```

### Commit Strategy

Each task = one commit. Format: `refactor(phase-N): <what changed>`

### Files Affected Summary

| Phase | New Files | Modified Files | Deleted Files |
|-------|-----------|----------------|---------------|
| 1 | 1 | 2 | 0 |
| 2 | 5 | 4 | 1 |
| 3 | 9 | 4 | 0 |
| 4 | 5 | 9 | 0 |
| 5 | 9 | 6 | 1 |
| **Total** | **29** | **25** | **2** |

### End State

| Component | Before | After |
|-----------|--------|-------|
| `BoardClient.tsx` | 897L, 41 imports | ~450L, thin shell composing providers |
| `Canvas.tsx` | 863L, 75 props | ~400L, reads from context, minimal props |
| `CanvasOverlays.tsx` | 249L pass-through | **Deleted** |
| `usePersistence.ts` | 757L, 11 operations | Thin orchestrator + 4 focused sub-hooks |
| `useBoardState.ts` | 672L, 36 exports | ~400L, delegates to sub-hooks |
| `BoardObject` type | 50+ flat optional fields | 10 sub-interfaces + discriminated union |
| Text editing | 676L across 2 hooks | Single unified hook ~350L |
| Duplication sites | 6 copy-paste patterns | 0 — shared hooks/utilities |
| `executeUndo` | 0 tests | All 7 entry types covered |

### Structural Guardrails (prevent re-accumulation)

1. **Discriminated union types** — Compiler rejects adding fields to wrong shape type
2. **Split contexts** — New features consume context, don't thread props through 4 levels
3. **Focused hook pattern** — Precedent: "add a new hook" not "append to the 757-line one"
4. **Shared utility hooks** — Reuse is easier than copy-paste
5. **Split ShapeCallbacks** — New shape types implement only their relevant callback interface

---

## 5. Definition of Done

- [ ] All existing tests passing (zero regressions)
- [ ] `npx tsc --noEmit` — zero type errors, zero `@ts-ignore` or `as any` introduced
- [ ] `npx next build` — production build succeeds
- [ ] `useUndoExecution.test.ts` covers all 7 UndoEntry types (undo + redo)
- [ ] Every new module with non-trivial logic has co-located tests
- [ ] BoardClient < 500 lines
- [ ] Canvas props interface < 10 props
- [ ] CanvasOverlays.tsx deleted
- [ ] Zero copy-paste duplication sites remaining
- [ ] Code reviewed via `/audit`
- [ ] Retrospective completed via `/retrospective`
