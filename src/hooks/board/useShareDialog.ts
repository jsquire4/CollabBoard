'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BoardRole, BoardMember, BoardInvite, BoardShareLink } from '@/types/sharing'
import { toast } from 'sonner'

export interface UseShareDialogReturn {
  // Data
  members: BoardMember[]
  invites: BoardInvite[]
  shareLink: BoardShareLink | null
  loading: boolean

  // Invite form state
  inviteEmail: string
  setInviteEmail: (email: string) => void
  inviteRole: BoardRole
  setInviteRole: (role: BoardRole) => void
  inviteStatus: string | null

  // Link form state
  linkRole: 'editor' | 'viewer'
  setLinkRole: (role: 'editor' | 'viewer') => void
  copied: boolean

  // Ownership transfer state
  transferTarget: string | null
  setTransferTarget: (id: string | null) => void

  // Handlers
  handleInvite: () => Promise<void>
  handleRoleChange: (memberId: string, newRole: BoardRole) => Promise<void>
  handleAgentToggle: (memberId: string, value: boolean) => Promise<void>
  handleRemoveMember: (memberId: string) => Promise<void>
  handleDeleteInvite: (inviteId: string) => Promise<void>
  handleGenerateLink: () => Promise<void>
  handleDeactivateLink: () => Promise<void>
  copyLink: () => Promise<void>
  confirmTransferOwnership: () => Promise<void>
}

export function useShareDialog(boardId: string, userRole: BoardRole): UseShareDialogReturn {
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  const [members, setMembers] = useState<BoardMember[]>([])
  const [invites, setInvites] = useState<BoardInvite[]>([])
  const [shareLink, setShareLink] = useState<BoardShareLink | null>(null)
  const [loading, setLoading] = useState(true)

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<BoardRole>('editor')
  const [inviteStatus, setInviteStatus] = useState<string | null>(null)

  // Link form state
  const [linkRole, setLinkRole] = useState<'editor' | 'viewer'>('editor')
  const [copied, setCopied] = useState(false)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear copy-feedback timer on unmount to prevent setState on unmounted component
  useEffect(() => () => {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
  }, [])

  // Ownership transfer confirmation
  const [transferTarget, setTransferTarget] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [membersRes, invitesRes, linksRes] = await Promise.all([
      supabase.rpc('get_board_member_details', { p_board_id: boardId }),
      supabase.from('board_invites').select('*').eq('board_id', boardId),
      supabase.from('board_share_links').select('*').eq('board_id', boardId).eq('is_active', true).limit(1),
    ])

    if (membersRes.error || invitesRes.error || linksRes.error) {
      toast.error('Failed to load sharing data')
      setLoading(false)
      return
    }
    if (membersRes.data) {
      setMembers(membersRes.data as BoardMember[])
    }
    if (invitesRes.data) setInvites(invitesRes.data as BoardInvite[])
    if (linksRes.data && linksRes.data.length > 0) setShareLink(linksRes.data[0] as BoardShareLink)
    setLoading(false)
  }, [boardId, supabase])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function handleInvite() {
    const email = inviteEmail.trim().toLowerCase()
    if (!email) return
    setInviteStatus(null)

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setInviteStatus('Error: Please enter a valid email address')
      return
    }

    try {
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId, email, role: inviteRole }),
      })

      const data = await res.json()

      if (res.status === 201) {
        if (data.outcome === 'added') {
          setInviteStatus(`Added ${email} as ${inviteRole}`)
        } else if (data.outcome === 'invited') {
          setInviteStatus(`Invited ${email} (pending signup)`)
        } else {
          setInviteStatus(`Invite processed for ${email}`)
        }
        setInviteEmail('')
        loadData()
      } else if (res.status === 400) {
        setInviteStatus(`Error: ${data.error || 'Invalid request'}`)
      } else if (res.status === 403) {
        setInviteStatus('Error: You do not have permission to invite members')
      } else {
        setInviteStatus('Failed to send invite. Please try again.')
      }
    } catch {
      setInviteStatus('Failed to send invite. Please try again.')
    }
  }

  async function handleAgentToggle(memberId: string, value: boolean) {
    if (userRole !== 'owner' && userRole !== 'manager') return

    const { error } = await supabase
      .from('board_members')
      .update({ can_use_agents: value })
      .eq('id', memberId)
      .eq('board_id', boardId)

    if (error) {
      toast.error('Failed to update agent access')
    } else {
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, can_use_agents: value } : m))
    }
  }

  async function handleRoleChange(memberId: string, newRole: BoardRole) {
    if (userRole !== 'owner' && userRole !== 'manager') return
    if (newRole === 'owner') {
      setTransferTarget(memberId)
      return
    }

    const canUseAgents = newRole !== 'viewer'
    const { error } = await supabase
      .from('board_members')
      .update({ role: newRole, can_use_agents: canUseAgents })
      .eq('id', memberId)

    if (error) {
      toast.error('Failed to change role')
    } else {
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole, can_use_agents: canUseAgents } : m))
    }
  }

  async function confirmTransferOwnership() {
    if (!transferTarget) return

    const { error } = await supabase.rpc('transfer_board_ownership', {
      p_board_id: boardId,
      p_new_owner_member_id: transferTarget,
    })

    if (error) {
      toast.error('Failed to transfer ownership')
      return
    }

    setTransferTarget(null)
    loadData()
  }

  async function handleRemoveMember(memberId: string) {
    if (userRole !== 'owner' && userRole !== 'manager') return
    const { error } = await supabase
      .from('board_members')
      .delete()
      .eq('id', memberId)
      .eq('board_id', boardId)

    if (error) {
      toast.error('Failed to remove member')
    } else {
      setMembers(prev => prev.filter(m => m.id !== memberId))
    }
  }

  async function handleDeleteInvite(inviteId: string) {
    if (userRole !== 'owner' && userRole !== 'manager') return
    const { error } = await supabase
      .from('board_invites')
      .delete()
      .eq('id', inviteId)

    if (error) {
      toast.error('Failed to cancel invite')
    } else {
      setInvites(prev => prev.filter(i => i.id !== inviteId))
    }
  }

  async function handleGenerateLink() {
    if (userRole !== 'owner' && userRole !== 'manager') return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('board_share_links')
      .insert({
        board_id: boardId,
        role: linkRole,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      toast.error('Failed to generate link')
    } else if (data) {
      setShareLink(data as BoardShareLink)
    }
  }

  async function handleDeactivateLink() {
    if (userRole !== 'owner' && userRole !== 'manager') return
    if (!shareLink) return

    const { error } = await supabase
      .from('board_share_links')
      .update({ is_active: false })
      .eq('id', shareLink.id)

    if (error) {
      toast.error('Failed to deactivate link')
    } else {
      setShareLink(null)
    }
  }

  async function copyLink() {
    if (!shareLink) return
    const url = `${window.location.origin}/board/join/${shareLink.token}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy link')
    }
  }

  return {
    members,
    invites,
    shareLink,
    loading,
    inviteEmail,
    setInviteEmail,
    inviteRole,
    setInviteRole,
    inviteStatus,
    linkRole,
    setLinkRole,
    copied,
    transferTarget,
    setTransferTarget,
    handleInvite,
    handleRoleChange,
    handleAgentToggle,
    handleRemoveMember,
    handleDeleteInvite,
    handleGenerateLink,
    handleDeactivateLink,
    copyLink,
    confirmTransferOwnership,
  }
}
