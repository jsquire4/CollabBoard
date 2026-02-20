-- Add table_data column for table shape data (stored as JSONB)
ALTER TABLE board_objects ADD COLUMN IF NOT EXISTS table_data JSONB;

-- Expand type CHECK to include 'table'
-- Note: pg_get_constraintdef stores IN(...) as = ANY(ARRAY[...]), so we match on
-- 'sticky_note' which is always present in the type constraint definition.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'board_objects'
      AND c.contype = 'c'
      AND (
        c.conname = 'board_objects_type_check'
        OR pg_get_constraintdef(c.oid) LIKE '%sticky_note%'
      )
  LOOP
    EXECUTE format('ALTER TABLE board_objects DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE board_objects ADD CONSTRAINT board_objects_type_check
  CHECK (type IN ('sticky_note','rectangle','circle','frame','group','line','triangle','chevron','arrow','parallelogram','ngon','table'));
