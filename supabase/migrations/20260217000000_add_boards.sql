-- Create boards table
CREATE TABLE boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Untitled Board',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE boards ENABLE ROW LEVEL SECURITY;

-- RLS: users CRUD their own boards only
CREATE POLICY "Users can view own boards" ON boards FOR SELECT USING (auth.uid() = created_by);
CREATE POLICY "Users can create boards" ON boards FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update own boards" ON boards FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Users can delete own boards" ON boards FOR DELETE USING (auth.uid() = created_by);

-- FK from board_objects → boards (cascade delete)
-- Note: existing rows with the hardcoded UUID must be cleaned up first,
-- or this constraint can be added after migrating existing data.
ALTER TABLE board_objects
  ADD CONSTRAINT board_objects_board_id_fkey
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE;

-- Reuse existing update_updated_at trigger function
CREATE TRIGGER set_boards_updated_at
  BEFORE UPDATE ON boards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
