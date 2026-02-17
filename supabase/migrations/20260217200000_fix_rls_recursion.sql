-- Fix infinite recursion in board_members RLS policies.
-- The board_members policies reference board_members itself, causing recursion.
-- Solution: use SECURITY DEFINER functions that bypass RLS for membership checks.

-- Helper: check if a user is a member of a board (any role)
CREATE OR REPLACE FUNCTION is_board_member(p_board_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM board_members WHERE board_id = p_board_id AND user_id = p_user_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: get user's role on a board (NULL if not a member)
CREATE OR REPLACE FUNCTION get_board_role(p_board_id UUID, p_user_id UUID)
RETURNS TEXT AS $$
  SELECT role FROM board_members WHERE board_id = p_board_id AND user_id = p_user_id LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- Replace boards policies to use helpers
-- ============================================================
DROP POLICY IF EXISTS "Members can view boards" ON boards;
DROP POLICY IF EXISTS "Owners can update boards" ON boards;
DROP POLICY IF EXISTS "Owners can delete boards" ON boards;

CREATE POLICY "Members can view boards"
  ON boards FOR SELECT
  USING (is_board_member(id, auth.uid()));

CREATE POLICY "Owners can update boards"
  ON boards FOR UPDATE
  USING (get_board_role(id, auth.uid()) = 'owner');

CREATE POLICY "Owners can delete boards"
  ON boards FOR DELETE
  USING (get_board_role(id, auth.uid()) = 'owner');

-- ============================================================
-- Replace board_objects policies to use helpers
-- ============================================================
DROP POLICY IF EXISTS "Members can view board objects" ON board_objects;
DROP POLICY IF EXISTS "Editors can create board objects" ON board_objects;
DROP POLICY IF EXISTS "Editors can update board objects" ON board_objects;
DROP POLICY IF EXISTS "Editors can delete board objects" ON board_objects;

CREATE POLICY "Members can view board objects"
  ON board_objects FOR SELECT
  USING (is_board_member(board_id, auth.uid()));

CREATE POLICY "Editors can create board objects"
  ON board_objects FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND get_board_role(board_id, auth.uid()) IN ('owner', 'manager', 'editor')
  );

CREATE POLICY "Editors can update board objects"
  ON board_objects FOR UPDATE
  USING (get_board_role(board_id, auth.uid()) IN ('owner', 'manager', 'editor'));

CREATE POLICY "Editors can delete board objects"
  ON board_objects FOR DELETE
  USING (get_board_role(board_id, auth.uid()) IN ('owner', 'manager', 'editor'));

-- ============================================================
-- Replace board_members policies to use helpers (fixes recursion)
-- ============================================================
DROP POLICY IF EXISTS "Members can view board members" ON board_members;
DROP POLICY IF EXISTS "Managers can add board members" ON board_members;
DROP POLICY IF EXISTS "Managers can update board members" ON board_members;
DROP POLICY IF EXISTS "Managers can remove board members" ON board_members;

-- SELECT: user is a member of that board
CREATE POLICY "Members can view board members"
  ON board_members FOR SELECT
  USING (is_board_member(board_id, auth.uid()));

-- INSERT: user is owner/manager on that board
CREATE POLICY "Managers can add board members"
  ON board_members FOR INSERT
  WITH CHECK (get_board_role(board_id, auth.uid()) IN ('owner', 'manager'));

-- UPDATE: user is owner/manager on that board
CREATE POLICY "Managers can update board members"
  ON board_members FOR UPDATE
  USING (get_board_role(board_id, auth.uid()) IN ('owner', 'manager'));

-- DELETE: user is owner/manager, can't delete owner
CREATE POLICY "Managers can remove board members"
  ON board_members FOR DELETE
  USING (
    role != 'owner'
    AND get_board_role(board_id, auth.uid()) IN ('owner', 'manager')
  );

-- ============================================================
-- Replace board_invites policies to use helpers
-- ============================================================
DROP POLICY IF EXISTS "Members can view board invites" ON board_invites;
DROP POLICY IF EXISTS "Managers can create board invites" ON board_invites;
DROP POLICY IF EXISTS "Managers can delete board invites" ON board_invites;

CREATE POLICY "Members can view board invites"
  ON board_invites FOR SELECT
  USING (is_board_member(board_id, auth.uid()));

CREATE POLICY "Managers can create board invites"
  ON board_invites FOR INSERT
  WITH CHECK (get_board_role(board_id, auth.uid()) IN ('owner', 'manager'));

CREATE POLICY "Managers can delete board invites"
  ON board_invites FOR DELETE
  USING (get_board_role(board_id, auth.uid()) IN ('owner', 'manager'));

-- ============================================================
-- Replace board_share_links policies to use helpers
-- ============================================================
DROP POLICY IF EXISTS "Members can view share links" ON board_share_links;
DROP POLICY IF EXISTS "Managers can create share links" ON board_share_links;
DROP POLICY IF EXISTS "Managers can update share links" ON board_share_links;
DROP POLICY IF EXISTS "Managers can delete share links" ON board_share_links;

CREATE POLICY "Members can view share links"
  ON board_share_links FOR SELECT
  USING (is_board_member(board_id, auth.uid()));

CREATE POLICY "Managers can create share links"
  ON board_share_links FOR INSERT
  WITH CHECK (get_board_role(board_id, auth.uid()) IN ('owner', 'manager'));

CREATE POLICY "Managers can update share links"
  ON board_share_links FOR UPDATE
  USING (get_board_role(board_id, auth.uid()) IN ('owner', 'manager'));

CREATE POLICY "Managers can delete share links"
  ON board_share_links FOR DELETE
  USING (get_board_role(board_id, auth.uid()) IN ('owner', 'manager'));
