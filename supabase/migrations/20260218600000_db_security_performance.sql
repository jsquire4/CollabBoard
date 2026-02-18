-- 1. Performance indexes
CREATE INDEX IF NOT EXISTS idx_board_objects_parent_id ON board_objects(parent_id);
CREATE INDEX IF NOT EXISTS idx_board_objects_created_by ON board_objects(created_by);
CREATE INDEX IF NOT EXISTS idx_board_objects_board_deleted ON board_objects(board_id, deleted_at);

-- 2. Text/name length constraints
ALTER TABLE board_objects ADD CONSTRAINT chk_text_length CHECK (LENGTH(text) <= 10000);
ALTER TABLE boards ADD CONSTRAINT chk_name_length CHECK (LENGTH(name) <= 256);

-- 3. RLS policy: prevent updates to objects locked by another user
-- Drop existing UPDATE policy and replace with one that respects locks
DROP POLICY IF EXISTS "Editors can update board objects" ON board_objects;
CREATE POLICY "Editors can update board objects"
  ON board_objects FOR UPDATE
  USING (
    get_board_role(board_id, auth.uid()) IN ('owner', 'manager', 'editor')
    AND (locked_by IS NULL OR locked_by = auth.uid())
  );
