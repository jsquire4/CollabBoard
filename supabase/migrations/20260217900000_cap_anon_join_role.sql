-- Cap anonymous users joining via share link to 'editor' max.
-- Anonymous users (signed in via signInAnonymously) have is_anonymous = true
-- in auth.users. They should never get 'manager' role, even if the share
-- link grants it, to prevent anonymous users from inviting others.

CREATE OR REPLACE FUNCTION join_board_via_link(p_token TEXT)
RETURNS UUID AS $$
DECLARE
  v_link RECORD;
  v_user_id UUID;
  v_existing UUID;
  v_is_anon BOOLEAN;
  v_role TEXT;
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

  -- Determine effective role: cap anonymous users at 'editor'
  v_role := v_link.role;
  SELECT is_anonymous INTO v_is_anon FROM auth.users WHERE id = v_user_id;
  IF v_is_anon = true AND v_role IN ('manager', 'owner') THEN
    v_role := 'editor';
  END IF;

  -- Add as member if not already
  IF v_existing IS NULL THEN
    INSERT INTO board_members (board_id, user_id, role, added_by)
    VALUES (v_link.board_id, v_user_id, v_role, v_link.created_by);
  END IF;

  RETURN v_link.board_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
