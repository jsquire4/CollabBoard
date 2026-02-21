-- Phase 3: Comment persistence + API object formula field + board_messages tool_calls

-- ── Comments table ──────────────────────────────────────────────────────────

CREATE TABLE comments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id         UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  object_id        UUID NOT NULL REFERENCES board_objects(id) ON DELETE CASCADE,
  user_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_display_name TEXT,
  content          TEXT NOT NULL,
  resolved_at      TIMESTAMPTZ,
  parent_id        UUID REFERENCES comments(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comments_board_object ON comments (board_id, object_id, created_at);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Auto-set user_id and user_display_name from auth context on insert
CREATE OR REPLACE FUNCTION set_comment_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  NEW.user_id := auth.uid();
  NEW.user_display_name := COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'full_name'),
    (auth.jwt() -> 'user_metadata' ->> 'name'),
    split_part(auth.email(), '@', 1),
    'Unknown'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER comments_set_user
  BEFORE INSERT ON comments
  FOR EACH ROW EXECUTE FUNCTION set_comment_user();

-- Board members can read all comments on boards they belong to
CREATE POLICY "Board members can read comments"
ON comments FOR SELECT
USING (
  auth.uid() IN (
    SELECT user_id FROM board_members WHERE board_id = comments.board_id
  )
);

-- Board editors and owners can insert comments
CREATE POLICY "Board editors can insert comments"
ON comments FOR INSERT
WITH CHECK (
  auth.uid() IN (
    SELECT user_id FROM board_members
    WHERE board_id = comments.board_id
    AND role IN ('owner', 'editor')
  )
);

-- Comment authors can resolve (update resolved_at) their own comments, owners can resolve any
CREATE POLICY "Authors and owners can resolve comments"
ON comments FOR UPDATE
USING (
  auth.uid() = user_id
  OR auth.uid() IN (
    SELECT user_id FROM board_members
    WHERE board_id = comments.board_id AND role = 'owner'
  )
);

-- Comment authors and board owners can delete comments
CREATE POLICY "Authors and owners can delete comments"
ON comments FOR DELETE
USING (
  auth.uid() = user_id
  OR auth.uid() IN (
    SELECT user_id FROM board_members
    WHERE board_id = comments.board_id AND role = 'owner'
  )
);

-- Enable Realtime for comments table
ALTER PUBLICATION supabase_realtime ADD TABLE comments;
