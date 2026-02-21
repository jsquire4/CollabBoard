// ── Stroke presets ─────────────────────────────────────────────────────────
// Used by both ContextMenu and StylePanel as the single source of truth.

/** Width-only presets for the stroke Weight row. Dash style is controlled separately via DASH_PRESETS. */
export const STROKE_PRESETS = [
  { stroke_width: 1, stroke_dash: '[]', label: 'Thin' },
  { stroke_width: 2, stroke_dash: '[]', label: 'Medium' },
  { stroke_width: 4, stroke_dash: '[]', label: 'Thick' },
]

/** Stroke color swatches shown in both context menu and style panel. */
export const STROKE_COLOR_SWATCHES = [
  '#000000', '#374151', '#6B7280', '#EF4444', '#F97316', '#EAB308',
  '#22C55E', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6', '#FFFFFF',
]
