-- Phase 2: Board Agents — direct OpenAI integration columns

-- board_messages: scope by agent shape + audit trail
ALTER TABLE board_messages
  ADD COLUMN IF NOT EXISTS agent_object_id UUID REFERENCES board_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_display_name TEXT;

-- boards: thread id placeholder for future Assistants API upgrade
ALTER TABLE boards
  ADD COLUMN IF NOT EXISTS global_agent_thread_id TEXT;

-- board_objects: allow per-agent model override
ALTER TABLE board_objects
  ADD COLUMN IF NOT EXISTS model TEXT DEFAULT 'gpt-4o';

-- Index for efficient per-agent history queries
CREATE INDEX IF NOT EXISTS idx_board_messages_agent_object
  ON board_messages (board_id, agent_object_id);
