-- RPC to return board member details (email + display name) by joining auth.users.
-- SECURITY DEFINER so the client SDK can access auth.users indirectly.
-- Caller must be a member of the board.
CREATE OR REPLACE FUNCTION get_board_member_details(p_board_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  role TEXT,
  added_at TIMESTAMPTZ,
  email TEXT,
  display_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is a member of this board
  IF NOT EXISTS (
    SELECT 1 FROM board_members bm
    WHERE bm.board_id = p_board_id AND bm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a member of this board';
  END IF;

  RETURN QUERY
    SELECT
      bm.id,
      bm.user_id,
      bm.role::TEXT,
      bm.added_at,
      u.email::TEXT,
      COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1))::TEXT AS display_name
    FROM board_members bm
    JOIN auth.users u ON u.id = bm.user_id
    WHERE bm.board_id = p_board_id
    ORDER BY bm.added_at ASC;
END;
$$;
