-- Board sharing: members, invites, share links

-- board_members: tracks who has access and their role
CREATE TABLE board_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'editor', 'viewer')),
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(board_id, user_id)
);

-- board_invites: pending email invites (for users who may not exist yet)
CREATE TABLE board_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('manager', 'editor', 'viewer')),
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(board_id, email)
);

-- board_share_links: token-based shareable links
CREATE TABLE board_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Enable RLS on new tables
ALTER TABLE board_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_share_links ENABLE ROW LEVEL SECURITY;

-- Auto-create owner on board creation
CREATE OR REPLACE FUNCTION create_board_owner()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO board_members (board_id, user_id, role, added_by)
  VALUES (NEW.id, NEW.created_by, 'owner', NEW.created_by);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_create_board_owner
  AFTER INSERT ON boards
  FOR EACH ROW EXECUTE FUNCTION create_board_owner();

-- Backfill existing boards with owner membership
INSERT INTO board_members (board_id, user_id, role, added_by, added_at)
SELECT id, created_by, 'owner', created_by, created_at FROM boards
ON CONFLICT (board_id, user_id) DO NOTHING;

-- Helper function: lookup user by email (SECURITY DEFINER to access auth.users)
CREATE OR REPLACE FUNCTION lookup_user_by_email(p_email TEXT)
RETURNS UUID AS $$
  SELECT id FROM auth.users WHERE email = p_email LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================================
-- RLS Policies: boards (replace existing)
-- ============================================================

-- Drop existing policies on boards
DROP POLICY IF EXISTS "Users can view own boards" ON boards;
DROP POLICY IF EXISTS "Users can create boards" ON boards;
DROP POLICY IF EXISTS "Users can update own boards" ON boards;
DROP POLICY IF EXISTS "Users can delete own boards" ON boards;

-- SELECT: user is a member
CREATE POLICY "Members can view boards"
  ON boards FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM board_members WHERE board_id = boards.id AND user_id = auth.uid()
  ));

-- INSERT: user is the creator (unchanged logic)
CREATE POLICY "Users can create boards"
  ON boards FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- UPDATE: user is owner
CREATE POLICY "Owners can update boards"
  ON boards FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM board_members WHERE board_id = boards.id AND user_id = auth.uid() AND role = 'owner'
  ));

-- DELETE: user is owner
CREATE POLICY "Owners can delete boards"
  ON boards FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM board_members WHERE board_id = boards.id AND user_id = auth.uid() AND role = 'owner'
  ));

-- ============================================================
-- RLS Policies: board_objects (replace existing)
-- ============================================================

DROP POLICY IF EXISTS "Users can view board objects" ON board_objects;
DROP POLICY IF EXISTS "Users can create board objects" ON board_objects;
DROP POLICY IF EXISTS "Users can update board objects" ON board_objects;
DROP POLICY IF EXISTS "Users can delete board objects" ON board_objects;

-- SELECT: user is a member of the board
CREATE POLICY "Members can view board objects"
  ON board_objects FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM board_members WHERE board_id = board_objects.board_id AND user_id = auth.uid()
  ));

-- INSERT: user is owner/manager/editor
CREATE POLICY "Editors can create board objects"
  ON board_objects FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM board_members
      WHERE board_id = board_objects.board_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'manager', 'editor')
    )
  );

-- UPDATE: user is owner/manager/editor
CREATE POLICY "Editors can update board objects"
  ON board_objects FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM board_members
    WHERE board_id = board_objects.board_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'manager', 'editor')
  ));

-- DELETE: user is owner/manager/editor
CREATE POLICY "Editors can delete board objects"
  ON board_objects FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM board_members
    WHERE board_id = board_objects.board_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'manager', 'editor')
  ));

-- ============================================================
-- RLS Policies: board_members
-- ============================================================

-- SELECT: user is a member of that board
CREATE POLICY "Members can view board members"
  ON board_members FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM board_members bm WHERE bm.board_id = board_members.board_id AND bm.user_id = auth.uid()
  ));

-- INSERT: user is owner/manager on that board
CREATE POLICY "Managers can add board members"
  ON board_members FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM board_members bm
    WHERE bm.board_id = board_members.board_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('owner', 'manager')
  ));

-- UPDATE: user is owner/manager on that board
CREATE POLICY "Managers can update board members"
  ON board_members FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM board_members bm
    WHERE bm.board_id = board_members.board_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('owner', 'manager')
  ));

-- DELETE: user is owner/manager, can't delete owner
CREATE POLICY "Managers can remove board members"
  ON board_members FOR DELETE
  USING (
    role != 'owner'
    AND EXISTS (
      SELECT 1 FROM board_members bm
      WHERE bm.board_id = board_members.board_id
        AND bm.user_id = auth.uid()
        AND bm.role IN ('owner', 'manager')
    )
  );

-- ============================================================
-- RLS Policies: board_invites
-- ============================================================

-- SELECT: user is a member of that board
CREATE POLICY "Members can view board invites"
  ON board_invites FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM board_members WHERE board_id = board_invites.board_id AND user_id = auth.uid()
  ));

-- INSERT: user is owner/manager
CREATE POLICY "Managers can create board invites"
  ON board_invites FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM board_members
    WHERE board_id = board_invites.board_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'manager')
  ));

-- DELETE: user is owner/manager
CREATE POLICY "Managers can delete board invites"
  ON board_invites FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM board_members
    WHERE board_id = board_invites.board_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'manager')
  ));

-- ============================================================
-- RLS Policies: board_share_links
-- ============================================================

-- SELECT: user is a member of that board
CREATE POLICY "Members can view share links"
  ON board_share_links FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM board_members WHERE board_id = board_share_links.board_id AND user_id = auth.uid()
  ));

-- INSERT: user is owner/manager
CREATE POLICY "Managers can create share links"
  ON board_share_links FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM board_members
    WHERE board_id = board_share_links.board_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'manager')
  ));

-- UPDATE: user is owner/manager
CREATE POLICY "Managers can update share links"
  ON board_share_links FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM board_members
    WHERE board_id = board_share_links.board_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'manager')
  ));

-- DELETE: user is owner/manager
CREATE POLICY "Managers can delete share links"
  ON board_share_links FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM board_members
    WHERE board_id = board_share_links.board_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'manager')
  ));
