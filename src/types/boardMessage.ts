export interface BoardMessage {
  id: string
  board_id: string
  frame_id?: string | null
  /** Scopes message to a specific agent shape. null = global agent thread. */
  agent_object_id?: string | null
  role: 'user' | 'assistant' | 'system'
  user_id?: string | null
  /** Captured at insert time for audit trail — immutable after write. */
  user_display_name?: string | null
  content: string
  tool_calls?: unknown
  created_at: string
}
