-- Add can_use_agents to board_share_links so link joiners get intended permissions.
-- Only applies when role = 'editor'; viewers always have can_use_agents = false.

ALTER TABLE board_share_links
  ADD COLUMN IF NOT EXISTS can_use_agents BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN board_share_links.can_use_agents IS 'When role is editor, whether joiners get AI access. Ignored for viewer.';

-- Update join_board_via_link to pass can_use_agents to board_members insert
CREATE OR REPLACE FUNCTION join_board_via_link(p_token TEXT)
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

  SELECT id INTO v_existing
  FROM board_members
  WHERE board_id = v_link.board_id AND user_id = v_user_id;

  v_role := v_link.role;
  SELECT is_anonymous INTO v_is_anon FROM auth.users WHERE id = v_user_id;
  IF v_is_anon = true AND v_role IN ('manager', 'owner') THEN
    v_role := 'editor';
  END IF;

  -- can_use_agents: from link for editor, always false for viewer
  v_can_use_agents := CASE WHEN v_role = 'viewer' THEN false ELSE COALESCE(v_link.can_use_agents, false) END;

  IF v_existing IS NULL THEN
    INSERT INTO board_members (board_id, user_id, role, added_by, can_use_agents)
    VALUES (v_link.board_id, v_user_id, v_role, v_link.created_by, v_can_use_agents);
  END IF;

  RETURN v_link.board_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
