-- Include owner in members, order: owner first, then by added_at DESC (most recent first).
-- Used for board card display: owner first, next 3-4 most recently added.
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
        SELECT COALESCE(jsonb_agg(m ORDER BY ord, added_at DESC NULLS LAST), '[]'::jsonb)
        FROM (
          SELECT
            jsonb_build_object(
              'user_id', bm.user_id,
              'role', bm.role::TEXT,
              'display_name', COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1), 'Anonymous'),
              'is_anonymous', COALESCE(u.is_anonymous, false)
            ) AS m,
            CASE WHEN bm.role = 'owner' THEN 0 ELSE 1 END AS ord,
            bm.added_at
          FROM board_members bm
          JOIN auth.users u ON u.id = bm.user_id
          WHERE bm.board_id = b.id
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
