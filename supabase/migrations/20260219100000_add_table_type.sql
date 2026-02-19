-- Add table_data column for table shape data (stored as JSONB)
ALTER TABLE board_objects ADD COLUMN IF NOT EXISTS table_data JSONB;

-- Expand type CHECK to include 'table'
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT c.conname INTO constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  WHERE t.relname = 'board_objects'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%type%IN%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE board_objects DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE board_objects ADD CONSTRAINT board_objects_type_check
  CHECK (type IN ('sticky_note','rectangle','circle','frame','group','line','triangle','chevron','arrow','parallelogram','ngon','table'));
