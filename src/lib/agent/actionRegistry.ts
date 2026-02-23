/**
 * Shared action registry — single source of truth for all quick action metadata.
 *
 * Replaces duplicated definitions in GlobalAgentPanel.tsx and route.ts.
 * Each action is classified into a tier:
 *   - direct:        Deterministic ops (layout, z-order, group, duplicate). No LLM needed.
 *   - simple-create: Deterministic creation with placement (sticky, rectangle, frame, table).
 *   - llm:           Requires LLM reasoning (templates, recolor, summarize, etc.).
 */

export interface ActionDef {
  id: string
  label: string
  category: 'create' | 'layout' | 'template' | 'edit' | 'organize' | 'table' | 'query'
  tier: 'direct' | 'llm' | 'simple-create'
  /** LLM prompt (used by tier=llm; for other tiers, kept for fallback/display). */
  prompt: string
  /** Canned confirmation for direct/simple-create tier (template — count is injected at runtime). */
  confirmMessage?: string
  minSelection?: number
  requiresGroup?: boolean
  requiresTable?: boolean
  /** Tools needed by this action (replaces QUICK_ACTION_TOOL_GROUPS). */
  toolNames: string[]
  /** Category names this action is incompatible with when combined. */
  incompatibleWith?: string[]
}

export const ACTION_REGISTRY: ActionDef[] = [
  // ── Simple-create (deterministic with placement) ────────────────────────────
  {
    id: 'sticky',
    label: 'Add Sticky Note',
    category: 'create',
    tier: 'simple-create',
    prompt: 'Add a sticky note on the board.',
    confirmMessage: 'Done — added a sticky note.',
    toolNames: ['createStickyNote', 'precomputePlacements', 'moveObject'],
    incompatibleWith: ['layout', 'template'],
  },
  {
    id: 'rectangle',
    label: 'Add Rectangle',
    category: 'create',
    tier: 'simple-create',
    prompt: 'Add a rectangle shape on the board.',
    confirmMessage: 'Done — added a rectangle.',
    toolNames: ['createShape', 'precomputePlacements', 'moveObject'],
    incompatibleWith: ['layout', 'template'],
  },
  {
    id: 'frame',
    label: 'Add Frame',
    category: 'create',
    tier: 'simple-create',
    prompt: 'Add a frame on the board to group objects.',
    confirmMessage: 'Done — added a frame.',
    toolNames: ['createFrame', 'precomputePlacements', 'moveObject'],
    incompatibleWith: ['layout', 'template'],
  },
  {
    id: 'table',
    label: 'Add Table',
    category: 'create',
    tier: 'simple-create',
    prompt: 'Add a 3x3 table on the board.',
    confirmMessage: 'Done — added a table.',
    toolNames: ['createTable', 'precomputePlacements', 'moveObject'],
    incompatibleWith: ['layout', 'template'],
  },

  // ── Direct (no LLM) — layout ───────────────────────────────────────────────
  {
    id: 'grid',
    label: 'Arrange in Grid',
    category: 'layout',
    tier: 'direct',
    prompt: 'Arrange the selected objects in a tidy grid layout.',
    confirmMessage: 'Done — arranged objects in a grid.',
    minSelection: 1,
    toolNames: ['layoutObjects', 'getBoardState'],
    incompatibleWith: ['create', 'layout'],
  },
  {
    id: 'horizontal',
    label: 'Arrange Horizontally',
    category: 'layout',
    tier: 'direct',
    prompt: 'Arrange the selected objects in a horizontal row.',
    confirmMessage: 'Done — arranged objects horizontally.',
    minSelection: 2,
    toolNames: ['layoutObjects', 'getBoardState'],
    incompatibleWith: ['create', 'layout'],
  },
  {
    id: 'vertical',
    label: 'Arrange Vertically',
    category: 'layout',
    tier: 'direct',
    prompt: 'Arrange the selected objects in a vertical column.',
    confirmMessage: 'Done — arranged objects vertically.',
    minSelection: 2,
    toolNames: ['layoutObjects', 'getBoardState'],
    incompatibleWith: ['create', 'layout'],
  },
  {
    id: 'circle',
    label: 'Arrange in Circle',
    category: 'layout',
    tier: 'direct',
    prompt: 'Arrange the selected objects in a circle.',
    confirmMessage: 'Done — arranged objects in a circle.',
    minSelection: 2,
    toolNames: ['layoutObjects', 'getBoardState'],
    incompatibleWith: ['create', 'layout'],
  },

  // ── Templates (LLM) ────────────────────────────────────────────────────────
  {
    id: 'swot',
    label: 'SWOT Analysis',
    category: 'template',
    tier: 'llm',
    prompt: `Create a SWOT Analysis template on the board.

1. Use the precomputed placement for this action (origin + 4 cells), or call precomputePlacements with quickActionIds for the current request.
2. Create a frame titled "SWOT Analysis" (width 820, height 620) at the returned origin.
3. Create 4 rectangles using the cell coordinates:
   - Cell 0 (top-left): "Strengths" color #81C784
   - Cell 1 (top-right): "Weaknesses" color #E57373
   - Cell 2 (bottom-left): "Opportunities" color #4FC3F7
   - Cell 3 (bottom-right): "Threats" color #FFB74D
   Each rectangle's x, y, width, height come directly from the cell.
4. Place one sticky note at each cell's centerX/centerY.

Execute ALL steps before responding.`,
    toolNames: ['createFrame', 'createShape', 'createStickyNote', 'precomputePlacements', 'moveObject'],
    incompatibleWith: ['edit'],
  },
  {
    id: 'journey',
    label: 'User Journey',
    category: 'template',
    tier: 'llm',
    prompt: `Create a User Journey Map template on the board.

1. Use the precomputed placement for this action (origin + 5 cells), or call precomputePlacements with quickActionIds for the current request.
2. Create a frame titled "User Journey Map" (width 1200, height 400) at the returned origin.
3. Create 5 rectangles using the cell coordinates:
   - Cell 0: "Awareness" color #CE93D8
   - Cell 1: "Consideration" color #4FC3F7
   - Cell 2: "Decision" color #81C784
   - Cell 3: "Onboarding" color #FFB74D
   - Cell 4: "Retention" color #FFEB3B
   Each rectangle's x, y, width, height come directly from the cell.
4. Place one sticky note at each cell's centerX/centerY with placeholder text:
   - "User discovers product" in cell 0
   - "User evaluates options" in cell 1
   - "User makes a choice" in cell 2
   - "User gets started" in cell 3
   - "User stays engaged" in cell 4

Execute ALL steps before responding.`,
    toolNames: ['createFrame', 'createShape', 'createStickyNote', 'precomputePlacements', 'moveObject'],
    incompatibleWith: ['edit'],
  },
  {
    id: 'retro',
    label: 'Retrospective',
    category: 'template',
    tier: 'llm',
    prompt: `Create a Retrospective template on the board with 3 columns.

1. Use the precomputed placement for this action (origin + 3 cells), or call precomputePlacements with quickActionIds for the current request.
2. Create 3 frames using the cell coordinates:
   - Cell 0: "What went well" color #81C784
   - Cell 1: "What could improve" color #E57373
   - Cell 2: "Action items" color #4FC3F7
   Each frame's x, y, width, height come directly from the cell.
3. Place 2 placeholder sticky notes inside each frame (use the cell's x/y as a reference, offset down for the second note):
   - "Great teamwork on X" and "Shipped feature Y on time" in cell 0
   - "Slow code reviews" and "Unclear requirements" in cell 1
   - "Set up review SLA" and "Write acceptance criteria template" in cell 2

Execute ALL steps before responding.`,
    toolNames: ['createFrame', 'createStickyNote', 'precomputePlacements', 'moveObject'],
    incompatibleWith: ['edit'],
  },
  {
    id: 'sticky-grid',
    label: '2x3 Sticky Grid',
    category: 'template',
    tier: 'llm',
    prompt: `Create a 2x3 grid of sticky notes for pros/cons analysis.

1. Use the precomputed placement for this action (origin + 6 cells), or call precomputePlacements with quickActionIds for the current request.
2. Create a frame titled "Pros & Cons" (width 500, height 500) at the returned origin.
3. Create 6 sticky notes using the cell coordinates:
   - Cell 0 (row 0, left): "Pro 1" color #81C784
   - Cell 1 (row 0, right): "Con 1" color #E57373
   - Cell 2 (row 1, left): "Pro 2" color #81C784
   - Cell 3 (row 1, right): "Con 2" color #E57373
   - Cell 4 (row 2, left): "Pro 3" color #81C784
   - Cell 5 (row 2, right): "Con 3" color #E57373
   Each note placed at the cell's centerX/centerY.

Execute ALL steps before responding.`,
    toolNames: ['createFrame', 'createStickyNote', 'precomputePlacements', 'moveObject'],
    incompatibleWith: ['edit'],
  },

  // ── Edit (LLM) ─────────────────────────────────────────────────────────────
  {
    id: 'color-all',
    label: 'Recolor Selected',
    category: 'edit',
    tier: 'llm',
    prompt: 'Change the color of the selected objects to a single color. Use changeColor for each selected object.',
    minSelection: 1,
    toolNames: ['getBoardState', 'changeColor'],
    incompatibleWith: ['template'],
  },
  {
    id: 'delete-empty',
    label: 'Delete Empty Notes',
    category: 'edit',
    tier: 'llm',
    prompt: 'Delete all sticky notes that have no text. Use getBoardState to find them, then deleteObject for each.',
    toolNames: ['getBoardState', 'deleteObject'],
    incompatibleWith: ['template'],
  },

  // ── Organize — direct ──────────────────────────────────────────────────────
  {
    id: 'duplicate',
    label: 'Duplicate',
    category: 'organize',
    tier: 'direct',
    prompt: 'Duplicate the selected objects.',
    confirmMessage: 'Done — duplicated the selected objects.',
    minSelection: 1,
    toolNames: ['getBoardState', 'duplicateObject'],
  },
  {
    id: 'group',
    label: 'Group',
    category: 'organize',
    tier: 'direct',
    prompt: 'Group the selected objects.',
    confirmMessage: 'Done — grouped the selected objects.',
    minSelection: 2,
    toolNames: ['getBoardState', 'groupObjects'],
  },
  {
    id: 'ungroup',
    label: 'Ungroup',
    category: 'organize',
    tier: 'direct',
    prompt: 'Ungroup the selected group.',
    confirmMessage: 'Done — ungrouped the selected objects.',
    minSelection: 1,
    requiresGroup: true,
    toolNames: ['getBoardState', 'ungroupObjects'],
  },
  {
    id: 'bring-front',
    label: 'Bring to Front',
    category: 'organize',
    tier: 'direct',
    prompt: 'Bring the selected objects to the front.',
    confirmMessage: 'Done — brought to front.',
    minSelection: 1,
    toolNames: ['getBoardState', 'updateZIndex'],
  },
  {
    id: 'send-back',
    label: 'Send to Back',
    category: 'organize',
    tier: 'direct',
    prompt: 'Send the selected objects to the back.',
    confirmMessage: 'Done — sent to back.',
    minSelection: 1,
    toolNames: ['getBoardState', 'updateZIndex'],
  },

  // ── Table ──────────────────────────────────────────────────────────────────
  {
    id: 'read-table',
    label: 'Read Table',
    category: 'table',
    tier: 'llm',
    prompt: 'Read and summarize the selected table. Use getTableData with the table object id.',
    minSelection: 1,
    requiresTable: true,
    toolNames: ['getBoardState', 'getTableData'],
  },
  {
    id: 'add-table-row',
    label: 'Add Table Row',
    category: 'table',
    tier: 'direct',
    prompt: 'Add a row to the selected table.',
    confirmMessage: 'Done — added a row to the table.',
    minSelection: 1,
    requiresTable: true,
    toolNames: ['getBoardState', 'addTableRow'],
  },
  {
    id: 'update-table-cell',
    label: 'Update Table Cell',
    category: 'table',
    tier: 'llm',
    prompt: 'Update a specific cell in the selected table. Use getTableData first to understand structure, then updateTableCell with rowIndex and colIndex (0-based).',
    minSelection: 1,
    requiresTable: true,
    toolNames: ['getBoardState', 'getTableData', 'updateTableCell'],
  },

  // ── Query (LLM) ────────────────────────────────────────────────────────────
  {
    id: 'summarize',
    label: 'Summarize Board',
    category: 'query',
    tier: 'llm',
    prompt: `Give me a brief, high-level summary of what's on this board — what it's about, how it's organized, and any key content worth highlighting. Keep it short and useful.`,
    toolNames: ['getBoardState'],
  },
  {
    id: 'describe-image',
    label: 'Describe Image',
    category: 'query',
    tier: 'llm',
    prompt: 'Describe the image in the object the user points to. Use describeImage with the objectId.',
    toolNames: ['getBoardState', 'describeImage'],
  },
]

/** Lookup by action ID. */
export const ACTION_MAP: Record<string, ActionDef> = Object.fromEntries(
  ACTION_REGISTRY.map(a => [a.id, a]),
)

/** Maps action IDs to their required tool names (replaces QUICK_ACTION_TOOL_GROUPS). */
export const QUICK_ACTION_TOOL_GROUPS: Record<string, string[]> = Object.fromEntries(
  ACTION_REGISTRY.map(a => [a.id, a.toolNames]),
)

/**
 * Returns pairs of action IDs that are incompatible when combined.
 * E.g., a create action paired with a layout action.
 */
export function getIncompatiblePairs(ids: string[]): [string, string][] {
  const pairs: [string, string][] = []
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ACTION_MAP[ids[i]!]
      const b = ACTION_MAP[ids[j]!]
      if (!a || !b) continue

      const aIncompat = a.incompatibleWith ?? []
      const bIncompat = b.incompatibleWith ?? []

      if (aIncompat.includes(b.category) || bIncompat.includes(a.category)) {
        pairs.push([ids[i]!, ids[j]!])
      }
    }
  }
  return pairs
}

/**
 * Returns a human-readable warning for an incompatible pair, or null.
 */
export function getIncompatibilityReason(idA: string, idB: string): string | null {
  const a = ACTION_MAP[idA]
  const b = ACTION_MAP[idB]
  if (!a || !b) return null

  const aIncompat = a.incompatibleWith ?? []
  const bIncompat = b.incompatibleWith ?? []

  if (!aIncompat.includes(b.category) && !bIncompat.includes(a.category)) return null

  // Generate a brief reason
  if ((a.category === 'create' && b.category === 'layout') || (a.category === 'layout' && b.category === 'create')) {
    return `'${a.label}' and '${b.label}' won't work together — the layout needs existing objects to arrange.`
  }
  if ((a.category === 'create' && b.category === 'template') || (a.category === 'template' && b.category === 'create')) {
    return `'${a.label}' and '${b.label}' are redundant — the template already creates objects.`
  }
  if ((a.category === 'template' && b.category === 'edit') || (a.category === 'edit' && b.category === 'template')) {
    return `'${a.label}' and '${b.label}' conflict — can't edit objects that don't exist yet.`
  }
  if (a.category === 'layout' && b.category === 'layout') {
    return `'${a.label}' and '${b.label}' conflict — can't apply two layouts at once.`
  }
  return `'${a.label}' and '${b.label}' may not work well together.`
}

/**
 * Filter actions to those visible given the current selection.
 */
export function getVisibleActions(
  selectedIds: Set<string>,
  objects: Map<string, { type?: string }>,
): ActionDef[] {
  return ACTION_REGISTRY.filter(action => {
    if (action.minSelection === undefined || action.minSelection === 0) return true
    if (selectedIds.size < action.minSelection) return false
    if (action.requiresGroup) {
      for (const id of selectedIds) {
        if (objects.get(id)?.type === 'group') return true
      }
      return false
    }
    if (action.requiresTable) {
      for (const id of selectedIds) {
        if (objects.get(id)?.type === 'table') return true
      }
      return false
    }
    return true
  })
}
