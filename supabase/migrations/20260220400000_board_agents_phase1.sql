-- Phase 1: Board Agents Primitives
-- Creates files, file_board_shares, decks, comments tables
-- Adds new columns to board_objects, boards, board_members
-- Expands board_objects type CHECK constraint

-- ============================================================
-- Section 1: New tables
-- ============================================================

CREATE TABLE IF NOT EXISTS files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type    TEXT NOT NULL CHECK (owner_type IN ('user', 'board')),
  owner_id      UUID NOT NULL,
  created_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL,
  summary       TEXT,
  file_type     TEXT,
  size          BIGINT,
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS file_board_shares (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id    UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  board_id   UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  shared_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  UNIQUE (file_id, board_id)
);

CREATE TABLE IF NOT EXISTS decks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id    UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  slide_count INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id          UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  object_id         UUID REFERENCES board_objects(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content           TEXT NOT NULL,
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Section 2: New columns on board_objects
-- ============================================================

ALTER TABLE board_objects ADD COLUMN IF NOT EXISTS file_id           UUID REFERENCES files(id) ON DELETE SET NULL;
ALTER TABLE board_objects ADD COLUMN IF NOT EXISTS agent_state       TEXT;
ALTER TABLE board_objects ADD COLUMN IF NOT EXISTS agent_session_id  UUID;
ALTER TABLE board_objects ADD COLUMN IF NOT EXISTS source_agent_id   UUID REFERENCES board_objects(id) ON DELETE SET NULL;
ALTER TABLE board_objects ADD COLUMN IF NOT EXISTS deck_id           UUID REFERENCES decks(id) ON DELETE SET NULL;
ALTER TABLE board_objects ADD COLUMN IF NOT EXISTS slide_index       INTEGER;
ALTER TABLE board_objects ADD COLUMN IF NOT EXISTS is_slide          BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE board_objects ADD COLUMN IF NOT EXISTS formula           TEXT;

-- ============================================================
-- Section 3: New columns on boards and board_members
-- ============================================================

ALTER TABLE boards        ADD COLUMN IF NOT EXISTS premium_agent_slots SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE board_members ADD COLUMN IF NOT EXISTS can_use_agents      BOOLEAN  NOT NULL DEFAULT false;

-- ============================================================
-- Section 4: Expand type CHECK constraint
-- Uses the DO $$ pattern from 20260219100000_add_table_type.sql
-- Matches by constraint name or by the presence of 'sticky_note'
-- ============================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'board_objects'
      AND c.contype = 'c'
      AND (
        c.conname = 'board_objects_type_check'
        OR pg_get_constraintdef(c.oid) LIKE '%sticky_note%'
      )
  LOOP
    EXECUTE format('ALTER TABLE board_objects DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE board_objects ADD CONSTRAINT board_objects_type_check
  CHECK (type IN (
    'sticky_note',
    'rectangle',
    'circle',
    'frame',
    'group',
    'line',
    'triangle',
    'chevron',
    'arrow',
    'parallelogram',
    'ngon',
    'table',
    'file',
    'data_connector',
    'context_object',
    'agent',
    'agent_output',
    'text',
    'status_badge',
    'section_header',
    'metric_card',
    'checklist',
    'api_object'
  ));

-- ============================================================
-- Section 5: Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_board_objects_agent_session
  ON board_objects (agent_session_id)
  WHERE agent_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_board_objects_source_agent
  ON board_objects (source_agent_id)
  WHERE source_agent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_board_objects_deck
  ON board_objects (deck_id)
  WHERE deck_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_files_owner
  ON files (owner_type, owner_id);

CREATE INDEX IF NOT EXISTS idx_comments_object
  ON comments (object_id)
  WHERE object_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comments_board
  ON comments (board_id);

-- ============================================================
-- Section 6: RLS
-- Uses is_board_member() and get_board_role() helpers from
-- 20260217200000_fix_rls_recursion.sql
-- ============================================================

ALTER TABLE files            ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_board_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE decks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments         ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------
-- files
-- ----------------------------------------------------------

-- File owner (created_by) has full control over their files
CREATE POLICY "File owner can manage their files"
  ON files FOR ALL
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- Board members can read files that have been shared to a board they belong to
CREATE POLICY "Board members can read shared files"
  ON files FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM file_board_shares fbs
      WHERE fbs.file_id = files.id
        AND is_board_member(fbs.board_id, auth.uid())
    )
  );

-- ----------------------------------------------------------
-- file_board_shares
-- ----------------------------------------------------------

-- Board editors (owner / manager / editor) can share files to their board
CREATE POLICY "Board editors can share files"
  ON file_board_shares FOR INSERT
  WITH CHECK (
    get_board_role(board_id, auth.uid()) IN ('owner', 'manager', 'editor')
  );

-- Board members can see which files are shared to their board
CREATE POLICY "Board members can view file shares"
  ON file_board_shares FOR SELECT
  USING (is_board_member(board_id, auth.uid()));

-- ----------------------------------------------------------
-- decks
-- ----------------------------------------------------------

-- Board members can view decks on their board
CREATE POLICY "Board members can view decks"
  ON decks FOR SELECT
  USING (is_board_member(board_id, auth.uid()));

-- Board editors can create decks
CREATE POLICY "Board editors can create decks"
  ON decks FOR INSERT
  WITH CHECK (
    get_board_role(board_id, auth.uid()) IN ('owner', 'manager', 'editor')
  );

-- Board editors can update decks
CREATE POLICY "Board editors can update decks"
  ON decks FOR UPDATE
  USING (
    get_board_role(board_id, auth.uid()) IN ('owner', 'manager', 'editor')
  );

-- Board editors can delete decks
CREATE POLICY "Board editors can delete decks"
  ON decks FOR DELETE
  USING (
    get_board_role(board_id, auth.uid()) IN ('owner', 'manager', 'editor')
  );

-- ----------------------------------------------------------
-- comments
-- ----------------------------------------------------------

-- Board members can read all comments on their board
CREATE POLICY "Board members can view comments"
  ON comments FOR SELECT
  USING (is_board_member(board_id, auth.uid()));

-- Authenticated board members can post their own comments
CREATE POLICY "Board members can post comments"
  ON comments FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND is_board_member(board_id, auth.uid())
  );

-- Comment authors can update their own comments
CREATE POLICY "Comment authors can update their comments"
  ON comments FOR UPDATE
  USING (auth.uid() = user_id);

-- Comment authors or board managers can delete comments
CREATE POLICY "Comment authors and managers can delete comments"
  ON comments FOR DELETE
  USING (
    auth.uid() = user_id
    OR get_board_role(board_id, auth.uid()) IN ('owner', 'manager')
  );
