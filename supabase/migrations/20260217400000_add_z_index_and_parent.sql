ALTER TABLE board_objects ADD COLUMN z_index INTEGER NOT NULL DEFAULT 0;
ALTER TABLE board_objects ADD COLUMN parent_id UUID REFERENCES board_objects(id) ON DELETE SET NULL;

-- Add 'group' to the allowed types (drop the inline CHECK by looking up its actual name)
DO $$
DECLARE
  _con_name TEXT;
BEGIN
  SELECT con.conname INTO _con_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
   WHERE rel.relname = 'board_objects'
     AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%type%IN%'
   LIMIT 1;

  IF _con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE board_objects DROP CONSTRAINT %I', _con_name);
  END IF;
END $$;

ALTER TABLE board_objects ADD CONSTRAINT board_objects_type_check
  CHECK (type IN ('sticky_note', 'rectangle', 'circle', 'line', 'frame', 'group', 'connector', 'text'));

-- Backfill z_index by creation order per board
UPDATE board_objects SET z_index = sub.rn FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY board_id ORDER BY created_at) AS rn
  FROM board_objects
) sub WHERE board_objects.id = sub.id;
