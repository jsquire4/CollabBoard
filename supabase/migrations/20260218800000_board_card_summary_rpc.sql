-- RPC to return board summary for cards on the boards list.
-- Shows: shared members (excl owner), viewer count, anonymous count, invites, share link.
-- Caller must be a member of the board.
CREATE OR REPLACE FUNCTION get_board_card_summary(p_board_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Verify caller is a member of this board
  IF NOT EXISTS (
    SELECT 1 FROM board_members bm
    WHERE bm.board_id = p_board_id AND bm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a member of this board';
  END IF;

  SELECT jsonb_build_object(
    'members', (
      SELECT COALESCE(jsonb_agg(m), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'user_id', bm.user_id,
          'role', bm.role::TEXT,
          'display_name', COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1), 'Anonymous'),
          'is_anonymous', COALESCE(u.is_anonymous, false)
        ) AS m
        FROM board_members bm
        JOIN auth.users u ON u.id = bm.user_id
        WHERE bm.board_id = p_board_id AND bm.role != 'owner'
        ORDER BY bm.added_at ASC
      ) sub
    ),
    'viewers_count', (
      SELECT COUNT(*)::INT FROM board_members
      WHERE board_id = p_board_id AND role = 'viewer'
    ),
    'anonymous_count', (
      SELECT COUNT(*)::INT
      FROM board_members bm
      JOIN auth.users u ON u.id = bm.user_id
      WHERE bm.board_id = p_board_id AND COALESCE(u.is_anonymous, false) = true
    ),
    'invite_count', (
      SELECT COUNT(*)::INT FROM board_invites
      WHERE board_id = p_board_id
    ),
    'share_link', (
      SELECT jsonb_build_object('role', role::TEXT)
      FROM board_share_links
      WHERE board_id = p_board_id AND is_active = true
      LIMIT 1
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Batch version: returns summaries for multiple boards. Only includes boards the caller is a member of.
CREATE OR REPLACE FUNCTION get_boards_card_summaries(p_board_ids UUID[])
RETURNS TABLE (board_id UUID, summary JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id AS board_id,
    jsonb_build_object(
      'members', (
        SELECT COALESCE(jsonb_agg(m), '[]'::jsonb)
        FROM (
          SELECT jsonb_build_object(
            'user_id', bm.user_id,
            'role', bm.role::TEXT,
            'display_name', COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1), 'Anonymous'),
            'is_anonymous', COALESCE(u.is_anonymous, false)
          ) AS m
          FROM board_members bm
          JOIN auth.users u ON u.id = bm.user_id
          WHERE bm.board_id = b.id AND bm.role != 'owner'
          ORDER BY bm.added_at ASC
        ) sub
      ),
      'viewers_count', (
        SELECT COUNT(*)::INT FROM board_members bm2
        WHERE bm2.board_id = b.id AND bm2.role = 'viewer'
      ),
      'anonymous_count', (
        SELECT COUNT(*)::INT
        FROM board_members bm3
        JOIN auth.users u3 ON u3.id = bm3.user_id
        WHERE bm3.board_id = b.id AND COALESCE(u3.is_anonymous, false) = true
      ),
      'invite_count', (
        SELECT COUNT(*)::INT FROM board_invites bi
        WHERE bi.board_id = b.id
      ),
      'share_link', (
        SELECT jsonb_build_object('role', bsl.role::TEXT)
        FROM board_share_links bsl
        WHERE bsl.board_id = b.id AND bsl.is_active = true
        LIMIT 1
      )
    ) AS summary
  FROM boards b
  WHERE b.id = ANY(p_board_ids)
    AND EXISTS (
      SELECT 1 FROM board_members bm
      WHERE bm.board_id = b.id AND bm.user_id = auth.uid()
    );
END;
$$;
