'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BoardRole, BoardMember, BoardInvite, BoardShareLink } from '@/types/sharing'
import { toast } from 'sonner'

interface ShareDialogProps {
  boardId: string
  userRole: BoardRole
  onClose: () => void
}

type Tab = 'members' | 'invite' | 'link'

const ROLE_OPTIONS: { value: BoardRole; label: string }[] = [
  { value: 'manager', label: 'Manager' },
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' },
]

export function ShareDialog({ boardId, userRole, onClose }: ShareDialogProps) {
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  const [tab, setTab] = useState<Tab>('members')
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

  // Ownership transfer confirmation
  const [transferTarget, setTransferTarget] = useState<string | null>(null)

  const isOwner = userRole === 'owner'

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

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setInviteStatus('Error: Please enter a valid email address')
      return
    }

    // Try to look up the user by email (board-scoped — requires manager/owner)
    const { data: userId, error: lookupError } = await supabase.rpc('lookup_user_by_email', { p_board_id: boardId, p_email: email })
    if (lookupError) {
      toast.error('Failed to look up user')
      return
    }

    if (userId) {
      // User exists — add directly as member
      const { error } = await supabase
        .from('board_members')
        .upsert({
          board_id: boardId,
          user_id: userId,
          role: inviteRole,
        }, { onConflict: 'board_id,user_id' })

      if (error) {
        setInviteStatus('Failed to send invite. Please try again.')
      } else {
        setInviteStatus(`Added ${email} as ${inviteRole}`)
        setInviteEmail('')
        loadData()
      }
    } else {
      // User doesn't exist — create a pending invite
      const currentUser = (await supabase.auth.getUser()).data.user
      if (!currentUser) {
        setInviteStatus('Error: Session expired. Please refresh and try again.')
        return
      }
      const { error } = await supabase
        .from('board_invites')
        .upsert({
          board_id: boardId,
          email,
          role: inviteRole,
          invited_by: currentUser.id,
        }, { onConflict: 'board_id,email' })

      if (error) {
        setInviteStatus('Failed to send invite. Please try again.')
      } else {
        setInviteStatus(`Invited ${email} (pending signup)`)
        setInviteEmail('')
        loadData()
      }
    }
  }

  async function handleRoleChange(memberId: string, newRole: BoardRole) {
    if (userRole !== 'owner' && userRole !== 'manager') return
    // Ownership transfer
    if (newRole === 'owner') {
      setTransferTarget(memberId)
      return
    }

    const { error } = await supabase
      .from('board_members')
      .update({ role: newRole })
      .eq('id', memberId)

    if (error) {
      toast.error('Failed to change role')
    } else {
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m))
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
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy link')
    }
  }

  const tabClasses = (t: Tab) =>
    `rounded-lg px-4 py-2 text-sm font-medium transition ${
      tab === t
        ? 'bg-navy text-parchment'
        : 'bg-transparent text-charcoal/70 hover:bg-parchment-dark dark:text-parchment/40 dark:hover:bg-white/10'
    }`

  const getRoleOptions = () => {
    const options = [...ROLE_OPTIONS]
    if (isOwner) {
      options.unshift({ value: 'owner', label: 'Owner (transfer)' })
    }
    return options
  }

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 dark:bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[500px] max-h-[80vh] overflow-auto rounded-2xl bg-parchment p-6 shadow-xl dark:bg-[#1E293B] dark:ring-1 dark:ring-white/10"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-charcoal dark:text-parchment">Share Board</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-charcoal/70 transition hover:bg-parchment-dark hover:text-charcoal dark:text-parchment/40 dark:hover:bg-white/10"
          >
            ×
          </button>
        </div>

        <div className="mb-5 flex gap-1 rounded-lg bg-parchment-dark p-1">
          <button type="button" className={tabClasses('members')} onClick={() => setTab('members')}>
            Members
          </button>
          <button type="button" className={tabClasses('invite')} onClick={() => setTab('invite')}>
            Invite
          </button>
          <button type="button" className={tabClasses('link')} onClick={() => setTab('link')}>
            Link
          </button>
        </div>

        {loading ? (
          <p className="py-5 text-center text-charcoal/50 dark:text-parchment/50">Loading...</p>
        ) : (
          <>
            {/* Members Tab */}
            {tab === 'members' && (
              <div>
                {members.map(member => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between border-b border-parchment-border py-2.5"
                  >
                    <div>
                      {member.display_name && (
                        <div className="text-sm font-medium text-charcoal dark:text-parchment">{member.display_name}</div>
                      )}
                      <div className="text-xs text-charcoal/70 dark:text-parchment/60">{member.email ?? member.user_id.slice(0, 8) + '...'}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {member.role === 'owner' && !isOwner ? (
                        <span className="text-sm font-medium text-charcoal/70 dark:text-parchment/60">Owner</span>
                      ) : member.role === 'owner' && isOwner ? (
                        <span className="text-sm font-medium text-charcoal/70 dark:text-parchment/60">Owner (you)</span>
                      ) : (
                        <>
                          <select
                            value={member.role}
                            onChange={e => handleRoleChange(member.id, e.target.value as BoardRole)}
                            className="rounded-md border border-parchment-border px-2 py-1 text-sm text-charcoal outline-none focus:ring-2 focus:ring-navy dark:bg-[#111827] dark:border-white/10 dark:text-parchment"
                          >
                            {getRoleOptions().map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(member.id)}
                            className="rounded p-1 text-red-600 transition hover:bg-red-50"
                            title="Remove member"
                          >
                            ×
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}

                {invites.length > 0 && (
                  <>
                    <div className="mb-2 mt-4 text-xs font-medium text-charcoal/70 dark:text-parchment/60">Pending Invites</div>
                    {invites.map(invite => (
                      <div
                        key={invite.id}
                        className="flex items-center justify-between border-b border-parchment-border py-2"
                      >
                        <div className="text-sm text-charcoal/70 dark:text-parchment/60">
                          {invite.email}
                          <span className="ml-2 text-xs text-charcoal/60 dark:text-parchment/40">({invite.role})</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteInvite(invite.id)}
                          className="rounded p-1 text-red-600 transition hover:bg-red-50"
                          title="Cancel invite"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* Invite Tab */}
            {tab === 'invite' && (
              <div>
                <div className="mb-3 flex gap-2">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleInvite() }}
                    placeholder="Email address"
                    className="flex-1 rounded-lg border border-parchment-border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-navy dark:bg-[#111827] dark:border-white/10 dark:text-parchment dark:placeholder:text-parchment/40"
                  />
                  <select
                    value={inviteRole}
                    onChange={e => setInviteRole(e.target.value as BoardRole)}
                    className="rounded-lg border border-parchment-border px-3 py-2.5 text-sm text-charcoal outline-none focus:ring-2 focus:ring-navy dark:bg-[#111827] dark:border-white/10 dark:text-parchment"
                  >
                    {ROLE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleInvite}
                  disabled={!inviteEmail.trim()}
                  className="w-full rounded-lg bg-navy py-2.5 text-sm font-medium text-parchment transition hover:bg-navy/90 disabled:cursor-not-allowed disabled:bg-parchment-dark disabled:text-charcoal/30"
                >
                  Send Invite
                </button>
                {inviteStatus && (
                  <p className={`mt-3 text-sm ${inviteStatus.startsWith('Added') || inviteStatus.startsWith('Invite') ? 'text-green-600' : 'text-red-600'}`}>
                    {inviteStatus}
                  </p>
                )}
              </div>
            )}

            {/* Link Tab */}
            {tab === 'link' && (
              <div>
                {shareLink ? (
                  <div>
                    <div className="mb-3 break-all rounded-lg bg-parchment-dark px-3 py-2.5 text-sm text-charcoal/70 dark:bg-[#111827] dark:text-parchment/60">
                      {`${window.location.origin}/board/join/${shareLink.token}`}
                    </div>
                    <div className="mb-3 text-sm text-charcoal/70 dark:text-parchment/60">
                      Anyone with this link joins as <strong>{shareLink.role}</strong>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={copyLink}
                        className="flex-1 rounded-lg bg-navy py-2.5 text-sm font-medium text-parchment transition hover:bg-navy/90"
                      >
                        {copied ? 'Copied!' : 'Copy Link'}
                      </button>
                      <button
                        type="button"
                        onClick={handleDeactivateLink}
                        className="rounded-lg border border-red-600 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
                      >
                        Deactivate
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="mb-3 text-sm text-charcoal/70 dark:text-parchment/60">
                      Generate a shareable link. Anyone with the link can join the board.
                    </p>
                    <div className="flex gap-2">
                      <select
                        value={linkRole}
                        onChange={e => setLinkRole(e.target.value as 'editor' | 'viewer')}
                        className="rounded-lg border border-parchment-border px-3 py-2.5 text-sm text-charcoal outline-none focus:ring-2 focus:ring-navy dark:bg-[#111827] dark:border-white/10 dark:text-parchment"
                      >
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button
                        type="button"
                        onClick={handleGenerateLink}
                        className="flex-1 rounded-lg bg-navy py-2.5 text-sm font-medium text-parchment transition hover:bg-navy/90"
                      >
                        Generate Link
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Ownership transfer confirmation */}
        {transferTarget && (
          <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/50 dark:bg-black/70">
            <div className="w-[360px] rounded-xl bg-parchment p-6 shadow-xl dark:bg-[#1E293B] dark:ring-1 dark:ring-white/10">
              <h3 className="mb-3 text-base font-semibold text-charcoal dark:text-parchment">Transfer Ownership?</h3>
              <p className="mb-5 text-sm text-charcoal/70 dark:text-parchment/60">
                This will make the selected user the owner and change your role to manager. This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTransferTarget(null)}
                  className="rounded-lg border border-parchment-border px-4 py-2 text-sm transition hover:bg-parchment-dark dark:border-white/10 dark:text-parchment dark:hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmTransferOwnership}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500"
                >
                  Transfer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
