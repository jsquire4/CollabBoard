-- Phase 3: Comment persistence + API object formula field + board_messages tool_calls

-- ── Comments table ──────────────────────────────────────────────────────────
-- Phase 1 created a stub comments table; drop it and recreate with full schema.

-- Safety: refuse to drop if the table has data (protects production)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'comments' AND table_schema = 'public') THEN
    IF EXISTS (SELECT 1 FROM comments LIMIT 1) THEN
      RAISE EXCEPTION 'comments table is not empty — refusing to drop. Migrate data first.';
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS comments CASCADE;

CREATE TABLE comments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id         UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  object_id        UUID NOT NULL REFERENCES board_objects(id) ON DELETE CASCADE,
  user_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_display_name TEXT,
  content          TEXT NOT NULL CHECK (length(content) > 0 AND length(content) <= 10000),
  resolved_at      TIMESTAMPTZ,
  parent_id        UUID REFERENCES comments(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comments_board_object ON comments (board_id, object_id, created_at);
CREATE INDEX idx_comments_parent ON comments (parent_id) WHERE parent_id IS NOT NULL;

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Auto-set user_id from auth context on insert.
-- Reads display name from auth.users (SECURITY DEFINER can access auth schema).
-- Application layer supplies user_display_name as fallback if auth.uid() returns null
-- (e.g. service role inserts during tests). The trigger overwrites with DB truth.
CREATE OR REPLACE FUNCTION set_comment_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _uid UUID;
  _display_name TEXT;
BEGIN
  _uid := auth.uid();
  NEW.user_id := _uid;

  -- Prefer metadata name, fall back to email prefix, then to app-supplied value
  IF _uid IS NOT NULL THEN
    SELECT COALESCE(
      raw_user_meta_data->>'full_name',
      raw_user_meta_data->>'name',
      split_part(email, '@', 1)
    )
    INTO _display_name
    FROM auth.users
    WHERE id = _uid;

    IF _display_name IS NOT NULL THEN
      NEW.user_display_name := _display_name;
    END IF;
  END IF;

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

-- Authors can update only their own comments; owners can update any.
-- WITH CHECK restricts updates to the same user_id (prevents user spoofing).
CREATE POLICY "Authors and owners can resolve comments"
ON comments FOR UPDATE
USING (
  auth.uid() = user_id
  OR auth.uid() IN (
    SELECT user_id FROM board_members
    WHERE board_id = comments.board_id AND role = 'owner'
  )
)
WITH CHECK (
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
