-- RPC function to join a board via share link.
-- Needs SECURITY DEFINER because the joining user isn't a member yet,
-- so they can't read board_share_links or insert into board_members via RLS.
CREATE OR REPLACE FUNCTION join_board_via_link(p_token TEXT)
RETURNS UUID AS $$
DECLARE
  v_link RECORD;
  v_user_id UUID;
  v_existing UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Look up the share link
  SELECT * INTO v_link
  FROM board_share_links
  WHERE token = p_token AND is_active = true;

  IF v_link IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired share link';
  END IF;

  -- Check if already a member
  SELECT id INTO v_existing
  FROM board_members
  WHERE board_id = v_link.board_id AND user_id = v_user_id;

  -- Add as member if not already
  IF v_existing IS NULL THEN
    INSERT INTO board_members (board_id, user_id, role, added_by)
    VALUES (v_link.board_id, v_user_id, v_link.role, v_link.created_by);
  END IF;

  RETURN v_link.board_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
