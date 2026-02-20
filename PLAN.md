# Implementation Plan: Board Agents Phase 1 — Primitive Wireframes

## Chosen Approach

Purpose-built wireframe stubs for every new primitive. Each component establishes the structural skeleton — correct prop interface, state shape, rendering surface — so a UI styling stream and a functionality stream can work in parallel with zero collisions. Visual surfaces are fully isolated (Tailwind classNames on DOM panels, named color constants on Konva shapes). No business logic, no real API calls, no traversal in any stub.

**Branch:** `feat/board-agents` (current)

**Parallel stream contract:**
- **UI stream owns:** visual styling of all new components (colors, spacing, animation), `LeftToolbar` preset icons, panel layout polish
- **Functionality stream owns:** DB migrations, agent execution, file upload, formula evaluation, DnD reordering, comment persistence
- **Shared (no-touch rule):** `src/types/board.ts`, `src/types/boardObject.ts`, `renderShape/index.tsx` — these are committed first and neither stream modifies them until the other's PR is merged

---

## Full Primitive List

### New `board_objects` types (10)
| Type | Description |
|---|---|
| `data_connector` | Semantic edge, VectorShape 3rd variant — dashed, purple stroke |
| `context_object` | Canvas file wrapper — icon + file_name display |
| `agent` | Agent node — ComfyUI state ring, click opens AgentChatPanel |
| `agent_output` | Read-only output object — markdown/text, `source_agent_id` back-ref |
| `text` | Standalone text, no sticky note chrome |
| `status_badge` | Colored pill label |
| `section_header` | Labeled divider/horizontal rule |
| `metric_card` | Big number + label, `formula` field stubbed for future math chaining |
| `checklist` | Checkbox task list |
| `api_object` | External API endpoint node stub — data pipe in/out |

### Extended existing type
- `frame` gains `is_slide: boolean`, `deck_id: UUID FK → decks`, `slide_index: integer`
- Slide badge renders on canvas when `is_slide=true`; filmstrip panel shows deck order

### New tables (schema + RLS only)
- `files` — personal and board-owned file library
- `file_board_shares` — cross-board file sharing
- `decks` — named slide decks, multiple per board
- `comments` — threaded comment threads anchored to board_objects

### New board_objects columns
`file_id`, `agent_state`, `agent_session_id`, `source_agent_id`, `deck_id`, `slide_index`, `is_slide`, `formula`

### New boards/board_members columns
`boards.premium_agent_slots` (SMALLINT DEFAULT 1), `board_members.can_use_agents` (BOOLEAN DEFAULT false)

### New UI stub components (6)
- `AgentChatPanel.tsx` — canvas-anchored, positioned at `agent.x + width + 16`
- `FilmstripPanel.tsx` — horizontal slide thumbnail strip with drag handle stubs
- `FileLibraryPanel.tsx` — canvas document sidebar, empty-state stub
- `CommentThread.tsx` — anchored comment thread panel stub
- `ApiObjectPanel.tsx` — API config panel (URL + method inputs, save stub)
- `BoardList.tsx` — "My Files" tab with empty state

---

## 1. Testing Strategy

### Principle
Phase 1 tests verify structural contracts, not behavior. Every test must survive Phase 2/3 wiring without modification.

### Essential Tests (gate CI on these)

**`src/test/typeContracts.test.ts`** (new)
- Exhaustiveness list: `ALL_TYPES` array with all 23 type strings (13 existing + 10 new)
- Asserts no duplicates and `makeObject({ type })` doesn't throw for any entry
- Compile-time: `_exhaustive: never` in `renderShape` still type-checks

**`src/test/boardObjectFactory.ts`** (extend existing)
- 11 new maker functions: `makeAgent`, `makeAgentOutput`, `makeDataConnector`, `makeContextObject`, `makeStatusBadge`, `makeSectionHeader`, `makeMetricCard`, `makeChecklist`, `makeApiObject`, `makeTextObject`, `makeSlideFrame`
- Each tested: correct `type`, new fields present/nullable as expected
- **TDD candidate** — write factory tests first, then implement makers

**`src/components/board/renderShape/renderShape.test.ts`** (new)
- One `it('renders <type> without crash')` per new type using factory fixtures
- Asserts `renderShape(obj, state, callbacks) !== null`
- Existing types smoke-tested for regression
- **TDD candidate** — all 10 fail initially (hit `default: never`), go green as each component lands

**Component smoke tests** (co-located `.test.tsx` beside each new stub)
- `AgentShape.test.tsx` — all 4 `agent_state` values render without crash; `onStateChange` prop accepted
- `AgentOutputShape.test.tsx` — renders with `source_agent_id`, renders without crash
- `MetricCard.test.tsx` — renders with `formula: null`, renders with `formula: 'SUM(A1)'` (no computation)
- `AgentChatPanel.test.tsx` — renders with `isOpen: false` and `isOpen: true`; prop interface compiles
- `FilmstripPanel.test.tsx` — renders with empty `decks: []` and with decks
- `CommentThread.test.tsx` — renders without crash
- `FrameShape.test.tsx` (new) — `makeSlideFrame` renders without crash; existing `makeFrame` still passes (backward compat)

**`src/lib/supabase/agentSchema.test.ts`** (new)
- Asserts migration file `20260220400000_board_agents_phase1.sql` exists
- Reads SQL and asserts it contains `agent_state`, `source_agent_id`, `formula`, `is_slide` string tokens

**`agent/src/__tests__/type-parity.test.ts`** (new)
- Requires adding `export const BOARD_OBJECT_TYPES: readonly BoardObjectType[]` companion array to `agent/src/types.ts`
- Asserts agent type list contains all 23 expected type strings

### Deferred Tests (Phase 2/3)
- Agent state machine transitions (needs realtime subscription)
- MetricCard formula evaluation (needs formula engine)
- data_connector traversal logic (needs 2-hop resolver)
- AgentChatPanel message round-trip (needs useAgentChat wired)
- FilmstripPanel slide reordering (needs DnD + deck persistence)
- CommentThread read/write (needs `comments` table live queries)
- context_object file binding (needs file picker + `file_board_shares`)
- My Files tab real data (needs `files` table queries)

### Test Infrastructure Changes

1. **`src/test/boardObjectFactory.ts`** — 11 new maker functions; `makeDataConnector` calls `makeLine` internally (VectorObject requires `x2`/`y2`)
2. **`agent/src/types.ts`** — add `export const BOARD_OBJECT_TYPES` companion array
3. **`vitest.config.ts`** — add new stub files to coverage exclusions (branch coverage would fail on empty stubs)
4. **`src/test/renderWithBoardContext.tsx`** — if an `AgentContext` is introduced, add default value + wrapper helper

### Acceptance Criteria

- [ ] `npx tsc --noEmit` passes with zero errors in `src/` and `agent/src/`
- [ ] `npm run test` passes, zero regressions on existing tests
- [ ] `cd agent && npm run test` passes (parity test for new types)
- [ ] `BoardObjectType` union contains all 23 types in both `src/types/board.ts` and `agent/src/types.ts`
- [ ] `renderShape.test.ts` exists with 10 new type smoke tests — all passing
- [ ] All 11 new factory makers exist and their tests pass
- [ ] `_exhaustive: never` branch in `renderShape/index.tsx` still compiles
- [ ] All migration files exist and `agentSchema.test.ts` passes
- [ ] `npx next build` succeeds

---

## 2. Implementation Plan

### Tier 0 — Type Foundation (commits first, blocks everything)

**T0-A: Expand `BoardObjectType` union**
- File: `src/types/board.ts`
- Add 10 new literals to the union
- This intentionally breaks TypeScript at `renderShape`'s `_exhaustive` guard — patch in same commit by routing new types through the registry guard (they hit `shapeRegistry.has()` first)

**T0-B: Agent parity — `BoardObjectType` union (parallel with T0-A)**
- File: `agent/src/types.ts`
- Mirror all 10 new literals; add `BOARD_OBJECT_TYPES` companion const array

**T0-C: New sub-interfaces + extend `BoardObject` (after T0-A)**
- File: `src/types/boardObject.ts`
- Add `BoardObjectAgent` → `agent_state`, `agent_session_id`, `source_agent_id`
- Add `BoardObjectSlide` → `is_slide`, `deck_id`, `slide_index`
- Add `BoardObjectMeta` → `file_id`, `formula`
- Extend composed `BoardObject` with all three new sub-interfaces
- Add `AgentObject` narrowed type: `BoardObject & { type: 'agent'; agent_state: string }`
- Extend `VectorObject` to include `'data_connector'`
- Extend `GenericShapeObject` to include 7 new registry-based types

---

### Tier 1 — DB Migration (parallel with everything, no code dependencies)

**T1-A: `supabase/migrations/20260220400000_board_agents_phase1.sql`** (new file)

Sections in order:
1. Create `files` table (`owner_type` CHECK `IN ('user','board')`, `storage_path`, `name`, `size`, etc.)
2. Create `file_board_shares` table (file_id FK, board_id FK, UNIQUE(file_id, board_id))
3. Create `decks` table (board_id FK, name, slide_count, timestamps)
4. Create `comments` table (board_id FK, object_id FK → board_objects, parent_comment_id self-ref, user_id FK, content, resolved_at)
5. `ALTER TABLE board_objects ADD COLUMN IF NOT EXISTS` for all 8 new columns
6. `ALTER TABLE boards ADD COLUMN IF NOT EXISTS premium_agent_slots SMALLINT NOT NULL DEFAULT 1`
7. `ALTER TABLE board_members ADD COLUMN IF NOT EXISTS can_use_agents BOOLEAN NOT NULL DEFAULT false`
8. Dynamic `DO $$` CHECK constraint drop + re-add (exact pattern from `20260219100000_add_table_type.sql`)
9. Indexes: `idx_board_objects_agent_session`, `idx_board_objects_source_agent`, `idx_board_objects_deck`, `idx_files_owner`, `idx_comments_object`, `idx_comments_board`
10. RLS enable + policies for all 4 new tables using `is_board_member()` / `get_board_role()` helpers

---

### Tier 2 — Shape Scaffolding (after T0-A/T0-C)

**T2-UI-A: Registry entries for 7 new shapes** (parallel, after T0-A)
- File: `src/components/board/shapeRegistry.ts`
- Add `shapeRegistry.set(...)` for: `status_badge`, `section_header`, `metric_card`, `checklist`, `api_object`, `context_object`, `agent_output`
- Strategy `'rect'` for all; set distinct `defaultColor` and `getTextInset`; no logic
- These auto-flow through the existing `shapeRegistry.has()` guard in `renderShape` — no switch case needed

**T2-UI-B: Extend VectorShape variant prop** (parallel, after T0-A)
- File: `src/components/board/VectorShape.tsx`
- `variant: 'line' | 'arrow'` → `variant: 'line' | 'arrow' | 'data_connector'`
- Add branch: when `variant === 'data_connector'` → `dash = [8, 6]`, `stroke = '#7C3AED'`
- Update memo comparator at bottom of file to include `'data_connector'`

**T2-UI-D: `AgentShape.tsx` stub** (parallel, after T0-A + T0-C)
- File: `src/components/board/AgentShape.tsx` (new)
- Props: standard Konva shape props + `onAgentClick: (id: string) => void`
- Konva `Group` with outer `Rect` (200×140), state ring as `Circle` border using named `AGENT_STATE_COLORS` record (`idle: '#94A3B8'`, `thinking: '#3B82F6'`, `done: '#22C55E'`, `error: '#EF4444'`), `Text` label showing state
- `AGENT_STATE_COLORS` exported as named const — UI stream's reskin surface

**T2-UI-E: FrameShape slide badge** (after T0-C)
- File: `src/components/board/FrameShape.tsx`
- Add conditional `<Rect>` + `<Text>` at top-right when `object.is_slide === true`
- Badge fill `'#6366F1'`, white text showing `object.slide_index ?? ''`
- Additive only — no existing behavior changed

**T2-UI-C: Patch `renderShape` switch** (after T2-UI-A, T2-UI-B, T2-UI-D — the serializing gate)
- File: `src/components/board/renderShape/index.tsx`
- Add `case 'data_connector':` inside the `case 'line': case 'arrow':` block
- Add `case 'agent':` routing to `<AgentShape>`
- All 7 registry types already handled by the `shapeRegistry.has()` guard above the switch
- Remaining new types (`agent_output`, `text`, `context_object`, `checklist`, `metric_card`, `status_badge`, `section_header`, `api_object`) routed through registry — no explicit cases needed
- `_exhaustive` guard now compiles clean

**T2-DATA-A: Agent defaults parity** (after T0-B)
- File: `agent/src/lib/defaults.ts`
- Add 10 entries to `SHAPE_DEFAULTS` for all new types with geometry defaults

---

### Tier 3 — Panel Stubs (fully parallel, minimal dependencies)

All 6 can be written simultaneously:

**T3-A: `AgentChatPanel.tsx`** (after T0-A for prop types)
- Fixed div positioned via `style={{ left: position.x, top: position.y }}`
- Header with close button, scrollable empty message list, stub `<input>`, disabled send button
- Does NOT use `useAgentChat` — that's Phase 2

**T3-B: `FilmstripPanel.tsx`** (after T0-A)
- Horizontal strip of gray placeholder thumbnails with slide number
- Drag handles as `<span draggable>` stubs; `onReorder` prop defined, not called
- Export button: `console.warn('export stub')`

**T3-C: `FileLibraryPanel.tsx`** (no dependencies)
- Upload button (disabled), empty state div "No files yet"
- List area empty — Phase 2 wires `files` table query

**T3-D: `CommentThread.tsx`** (no dependencies)
- Mirrors AgentChatPanel structure; resolve button (disabled)

**T3-E: `ApiObjectPanel.tsx`** (no dependencies)
- Two controlled `<input>` fields (URL, method) with local state, not persisted
- Save: `console.warn('api config stub')`

**T3-F: `BoardList.tsx` My Files tab** (no dependencies)
- Add `useState<'boards' | 'shared' | 'files'>('boards')` tab state
- Three tab buttons above sections; "My Files" renders empty state div

---

### Tier 4 — Toolbar Presets (UI stream, after T2-UI-A)

**T4-A: `shapePresets.ts` new preset arrays**
- `AGENT_PRESETS`: `agent`, `agent_output`, `context_object`
- `DATA_PRESETS`: `data_connector`, `api_object`
- `CONTENT_PRESETS`: `text`, `status_badge`, `section_header`, `metric_card`, `checklist`
- Each entry: `id`, `label`, `dbType`, `defaultWidth`, `defaultHeight`, `iconPath` (stub SVG paths)

**T4-B: `LeftToolbar.tsx` new tool groups** (after T4-A)
- Add `AGENTS_IDS` + `CONTENT_IDS` arrays (mirror existing `BASICS_IDS` pattern)
- Add "Agents" `ToolGroupButton` with `AGENT_PRESETS`
- Add "Content" `ToolGroupButton` with `CONTENT_PRESETS`
- Promote `data_connector` into Lines flyout alongside line/arrow

---

### Tier 5 — BoardClient Panel State Wiring (after all T3 stubs)

**T5-A: `BoardClient.tsx`** (after T3-A through T3-E)
- Add panel state following `chatOpen` / `shareOpen` pattern:
  - `agentChatPanel: { objectId, position } | null`
  - `filmstripOpen: boolean`
  - `fileLibraryOpen: boolean`
  - `commentThread: { objectId, position } | null`
  - `apiObjectPanel: string | null` (objectId)
- Mount each panel stub conditionally
- Pass `onAgentClick` down to Canvas → `AgentShape`; handler sets `agentChatPanel` state

---

## 3. Error Handling

### Failure Modes

| Risk | Impact | Mitigation |
|---|---|---|
| `_exhaustive: never` breaks at T0-A before switch is patched | TypeScript errors block build | Patch `renderShape` in same commit as T0-A, routing new types through registry guard |
| `agent/src/types.ts` parity drift | Agent silently ignores new object types | Parity test + `BOARD_OBJECT_TYPES` const array catches at CI |
| `VectorShape` memo comparator not updated for `data_connector` | Stale renders on variant change | Update comparator in same commit as variant extension |
| Migration `DO $$` pattern fails on Supabase | CHECK constraint doesn't expand | Mirror exact pattern from `20260219100000_add_table_type.sql`; test locally first |
| `AgentShape` Konva animation mock missing | Component tests crash on animation APIs | Add animation mock to `src/test/mocks/konva.ts` if any Konva animation APIs are called in Phase 1 stubs (defer if stubs are static) |
| Coverage threshold fails on empty stubs | CI blocks PR | Add new stub files to coverage exclusion list in `vitest.config.ts` before running tests |
| Panel state in `BoardClient` causes re-render loops | Canvas performance regression | Use stable `useCallback` for `onAgentClick`; wrap panel state in `useMemo` if needed |

### Rollback Strategy
- Each tier = one commit. If a tier fails type-check: `git revert` that tier's commits, investigate, retry.
- Migration failure: Supabase local dev resets cleanly; staging can be rolled back via Supabase dashboard.
- Nuclear: `git reset --hard` to before Phase 1. Maximum loss = this phase's work. The branch is clean now.

---

## 4. Execution Strategy

### Parallelization Map (3 agents after T0-A lands)

```
T0-A: BoardObjectType union        [SEQUENTIAL — commit this first, 5 min]
  │
  ├─> Agent 1 — Functionality stream (fully independent)
  │     T0-B: agent/src/types.ts parity
  │     T1-A: DB migration SQL file
  │     T2-DATA-A: agent/src/lib/defaults.ts
  │
  ├─> Agent 2 — Type + renderShape backbone
  │     T0-C: boardObject.ts sub-interfaces
  │     T2-UI-B: VectorShape variant extension
  │     T2-UI-D: AgentShape.tsx stub
  │     T2-UI-E: FrameShape slide badge
  │     T2-UI-C: renderShape switch patch  ← serializing gate, last in stream
  │
  └─> Agent 3 — Panel stubs + toolbar
        T3-C, T3-D, T3-E, T3-F  [parallel, no deps]
        T2-UI-A: shapeRegistry 7 entries
        T4-A: shapePresets new arrays
        T4-B: LeftToolbar new groups
        T3-A, T3-B  [after T0-A]
        T5-A: BoardClient panel state  [after all T3 done]
```

### File Ownership (no-touch rule during parallel work)

| File | Owner during Phase 1 |
|---|---|
| `src/types/board.ts` | Committed in T0-A; no further edits by either stream |
| `src/types/boardObject.ts` | Committed in T0-C; no further edits |
| `renderShape/index.tsx` | Committed in T2-UI-C; no further edits |
| `agent/src/types.ts` | Functionality stream |
| All new `src/components/board/*.tsx` stubs | UI stream to style after Phase 1 lands |

### Commit Format
`feat(phase-1): <what changed>` — one commit per tier task.

### Checkpoint
After T0-A + T0-C land: `npx tsc --noEmit` must pass before any other work starts.
After all tiers: `npx tsc --noEmit && npm run test && npx next build`.

---

## 5. What Each Stream Gets After Phase 1

### UI Stream gets immediately:
- `AgentShape.tsx` — state ring with `AGENT_STATE_COLORS` const as the reskin surface
- `AgentChatPanel.tsx` — panel structure, positioning model, layout to style
- `FilmstripPanel.tsx` — thumbnail strip structure, drag handle markup
- `FileLibraryPanel.tsx` — layout + empty state to design
- `CommentThread.tsx` — panel structure
- `ApiObjectPanel.tsx` — form layout
- `LeftToolbar.tsx` — 3 new tool groups rendering stub icons
- `VectorShape.tsx` — data_connector renders as distinct dashed line
- `FrameShape.tsx` — slide badge renders when `is_slide=true`
- `BoardList.tsx` — "My Files" tab navigable

All visual surfaces isolated: Tailwind classNames on DOM, named Konva color constants on canvas shapes.

### Functionality Stream picks up in Phase 2:
- `useAgentChat` wired into `AgentChatPanel` (prop interface already defined)
- `agent_state` driven by Supabase realtime subscription
- `FilmstripPanel` DnD via stubbed `onReorder` prop
- `FileLibraryPanel` upload via `files` table (migrated)
- `CommentThread` read/write via `comments` table (migrated)
- `ApiObjectPanel` persistence via board_object record (type in DB)
- `context_object` file icon from `file_id` FK resolution
- `metric_card` formula evaluation (`formula` column in DB)
- `checklist` item persistence
- `agent_output` from agent tool pipeline
- `BoardList` "My Files" real data from `files` table

---

## 6. Definition of Done

- [ ] `npx tsc --noEmit` — zero errors in `src/` and `agent/src/`
- [ ] `npm run test` — all existing tests pass, new smoke tests pass
- [ ] `cd agent && npm run test` — parity test passes
- [ ] `npx next build` — production build succeeds
- [ ] All 10 new `BoardObjectType` literals in both `src/types/board.ts` and `agent/src/types.ts`
- [ ] `renderShape.test.ts` exists with 10 new type smoke tests, all passing
- [ ] All 11 new factory makers exist and pass
- [ ] `_exhaustive` guard in `renderShape/index.tsx` compiles clean
- [ ] Migration file `20260220400000_board_agents_phase1.sql` exists and `agentSchema.test.ts` passes
- [ ] All 6 panel stubs render without crash (smoke tests pass)
- [ ] FrameShape renders slide badge when `is_slide=true`
- [ ] VectorShape renders `data_connector` as dashed purple line
- [ ] 3 new toolbar groups visible in LeftToolbar
- [ ] Code reviewed via `/audit`
- [ ] Retrospective via `/retrospective`
