-- Add marker columns for line termination markers
ALTER TABLE board_objects
  ADD COLUMN marker_start TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN marker_end TEXT NOT NULL DEFAULT 'none';

-- Existing arrow shapes should default to filled triangle end marker
UPDATE board_objects SET marker_end = 'arrow' WHERE type = 'arrow';
