-- Add x2/y2 columns for vector line/arrow endpoint coordinates
ALTER TABLE board_objects ADD COLUMN x2 DOUBLE PRECISION;
ALTER TABLE board_objects ADD COLUMN y2 DOUBLE PRECISION;

-- Backfill existing line/arrow rows: compute x2/y2 from x+width, y+height
UPDATE board_objects
SET x2 = x + width, y2 = y + height
WHERE type IN ('line', 'arrow');
