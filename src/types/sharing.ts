export type BoardRole = 'owner' | 'manager' | 'editor' | 'viewer'

export interface BoardMember {
  id: string
  board_id: string
  user_id: string
  role: BoardRole
  added_by: string | null
  added_at: string
  email?: string // populated via RPC lookup
  display_name?: string // populated via RPC lookup
  can_use_agents: boolean
}

export interface BoardInvite {
  id: string
  board_id: string
  email: string
  role: Exclude<BoardRole, 'owner'>
  invited_by: string
  created_at: string
}

export interface BoardShareLink {
  id: string
  board_id: string
  token: string
  role: 'editor' | 'viewer'
  created_by: string
  created_at: string
  is_active: boolean
}

export interface BoardWithRole {
  id: string
  name: string
  created_by: string
  created_at: string
  updated_at: string
  role: BoardRole
}

interface BoardCardSummaryMember {
  user_id: string
  role: string
  display_name: string
  is_anonymous: boolean
}

export interface BoardCardSummary {
  members: BoardCardSummaryMember[]
  viewers_count: number
  anonymous_count: number
  invite_count: number
  share_link: { role: 'editor' | 'viewer' } | null
}
