-- Add new shape types and styling columns for lines, font options

-- 1. Add new columns
ALTER TABLE board_objects ADD COLUMN IF NOT EXISTS stroke_width INTEGER DEFAULT 2;
ALTER TABLE board_objects ADD COLUMN IF NOT EXISTS stroke_dash TEXT; -- JSON array e.g. "[5,5]"
ALTER TABLE board_objects ADD COLUMN IF NOT EXISTS font_family TEXT DEFAULT 'sans-serif';
ALTER TABLE board_objects ADD COLUMN IF NOT EXISTS font_style TEXT DEFAULT 'normal'; -- normal, bold, italic, bold italic

-- 2. Expand type CHECK to include new shapes
ALTER TABLE board_objects DROP CONSTRAINT IF EXISTS board_objects_type_check;

ALTER TABLE board_objects ADD CONSTRAINT board_objects_type_check
  CHECK (type IN (
    'sticky_note', 'rectangle', 'circle', 'frame', 'group',
    'line', 'triangle', 'chevron', 'arrow', 'parallelogram'
  ));
