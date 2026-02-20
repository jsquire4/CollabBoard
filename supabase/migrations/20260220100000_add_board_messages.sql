-- Board chat messages for AI agent conversations
CREATE TABLE board_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  frame_id UUID,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content TEXT NOT NULL DEFAULT '',
  tool_calls JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_board_messages_board ON board_messages(board_id, created_at);

ALTER TABLE board_messages ENABLE ROW LEVEL SECURITY;

-- Board members can read messages
CREATE POLICY "Board members can read messages"
ON board_messages FOR SELECT
USING (
  auth.uid() IN (
    SELECT user_id FROM board_members WHERE board_id = board_messages.board_id
  )
);

-- Editors and owners can insert messages
CREATE POLICY "Board editors can insert messages"
ON board_messages FOR INSERT
WITH CHECK (
  auth.uid() IN (
    SELECT user_id FROM board_members
    WHERE board_id = board_messages.board_id
    AND role IN ('owner', 'editor')
  )
);
