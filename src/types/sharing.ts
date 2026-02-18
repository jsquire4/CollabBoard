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
