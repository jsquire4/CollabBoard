-- IP and user_id blocking for removed members.
-- Prevents removed users (especially anonymous) from rejoining via the same share link.

-- Store IP when someone joins via link (for block-on-remove)
ALTER TABLE board_members
  ADD COLUMN IF NOT EXISTS joined_via_ip INET;

COMMENT ON COLUMN board_members.joined_via_ip IS 'Client IP when joining via share link; used to block on remove.';

-- Per-board block lists
CREATE TABLE board_blocked_users (
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, user_id)
);

CREATE TABLE board_blocked_ips (
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  ip_address INET NOT NULL,
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, ip_address)
);

ALTER TABLE board_blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_blocked_ips ENABLE ROW LEVEL SECURITY;

-- Only owners/managers can manage block lists (via SECURITY DEFINER functions)
CREATE POLICY "No direct access to board_blocked_users"
  ON board_blocked_users FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE POLICY "No direct access to board_blocked_ips"
  ON board_blocked_ips FOR ALL
  USING (false)
  WITH CHECK (false);

-- Helper: get board_id from share token (for API route to check IP block before join)
CREATE OR REPLACE FUNCTION get_board_id_for_share_token(p_token TEXT)
RETURNS UUID AS $$
  SELECT board_id FROM board_share_links
  WHERE token = p_token AND is_active = true
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- Helper: check if IP is blocked for board (for API route before join)
CREATE OR REPLACE FUNCTION is_ip_blocked_for_board(p_board_id UUID, p_ip TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  IF p_ip IS NULL OR p_ip = '' THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM board_blocked_ips
    WHERE board_id = p_board_id AND ip_address = p_ip::inet
  );
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update join_board_via_link: check board_blocked_users, accept p_client_ip, store joined_via_ip
CREATE OR REPLACE FUNCTION join_board_via_link(p_token TEXT, p_client_ip INET DEFAULT NULL)
RETURNS UUID AS $$
DECLARE
  v_link RECORD;
  v_user_id UUID;
  v_existing UUID;
  v_is_anon BOOLEAN;
  v_role TEXT;
  v_can_use_agents BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_link
  FROM board_share_links
  WHERE token = p_token AND is_active = true;

  IF v_link IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired share link';
  END IF;

  -- Block if user was previously removed
  IF EXISTS (
    SELECT 1 FROM board_blocked_users
    WHERE board_id = v_link.board_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'You have been removed from this board';
  END IF;

  SELECT id INTO v_existing
  FROM board_members
  WHERE board_id = v_link.board_id AND user_id = v_user_id;

  v_role := v_link.role;
  SELECT is_anonymous INTO v_is_anon FROM auth.users WHERE id = v_user_id;
  IF v_is_anon = true AND v_role IN ('manager', 'owner') THEN
    v_role := 'editor';
  END IF;

  v_can_use_agents := CASE WHEN v_role = 'viewer' THEN false ELSE COALESCE(v_link.can_use_agents, false) END;

  IF v_existing IS NULL THEN
    INSERT INTO board_members (board_id, user_id, role, added_by, can_use_agents, joined_via_ip)
    VALUES (v_link.board_id, v_user_id, v_role, v_link.created_by, v_can_use_agents, p_client_ip);
  END IF;

  RETURN v_link.board_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Block and remove member: add to block lists, then delete. Caller must be owner/manager.
CREATE OR REPLACE FUNCTION block_and_remove_member(p_board_id UUID, p_member_id UUID)
RETURNS VOID AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_member_user_id UUID;
  v_joined_via_ip INET;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_caller_role
  FROM board_members
  WHERE board_id = p_board_id AND user_id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Only owners and managers can remove members';
  END IF;

  -- Cannot remove self if owner
  IF v_caller_role = 'owner' AND EXISTS (
    SELECT 1 FROM board_members WHERE id = p_member_id AND user_id = v_caller_id
  ) THEN
    RAISE EXCEPTION 'Transfer ownership before removing yourself';
  END IF;

  SELECT user_id, joined_via_ip INTO v_member_user_id, v_joined_via_ip
  FROM board_members
  WHERE id = p_member_id AND board_id = p_board_id;

  IF v_member_user_id IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  -- Add to block lists before delete
  INSERT INTO board_blocked_users (board_id, user_id)
  VALUES (p_board_id, v_member_user_id)
  ON CONFLICT (board_id, user_id) DO NOTHING;

  IF v_joined_via_ip IS NOT NULL THEN
    INSERT INTO board_blocked_ips (board_id, ip_address)
    VALUES (p_board_id, v_joined_via_ip)
    ON CONFLICT (board_id, ip_address) DO NOTHING;
  END IF;

  DELETE FROM board_members
  WHERE id = p_member_id AND board_id = p_board_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
