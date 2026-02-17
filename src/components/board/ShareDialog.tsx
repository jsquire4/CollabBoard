'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BoardRole, BoardMember, BoardInvite, BoardShareLink } from '@/types/sharing'

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
  const supabase = createClient()
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

  useEffect(() => {
    loadData()
  }, [boardId])

  async function loadData() {
    setLoading(true)
    const [membersRes, invitesRes, linksRes] = await Promise.all([
      supabase.from('board_members').select('*').eq('board_id', boardId),
      supabase.from('board_invites').select('*').eq('board_id', boardId),
      supabase.from('board_share_links').select('*').eq('board_id', boardId).eq('is_active', true).limit(1),
    ])

    if (membersRes.data) {
      // Look up emails for members
      const membersWithEmails = await Promise.all(
        membersRes.data.map(async (m) => {
          const { data } = await supabase.rpc('lookup_user_by_email', { p_email: '' })
          // We can't reverse-lookup email from user_id easily with client SDK.
          // Instead, store user_id and show it. For a real app you'd have a profiles table.
          return { ...m, email: m.user_id.slice(0, 8) + '...' } as BoardMember
        })
      )
      setMembers(membersWithEmails)
    }
    if (invitesRes.data) setInvites(invitesRes.data as BoardInvite[])
    if (linksRes.data && linksRes.data.length > 0) setShareLink(linksRes.data[0] as BoardShareLink)
    setLoading(false)
  }

  async function handleInvite() {
    const email = inviteEmail.trim().toLowerCase()
    if (!email) return
    setInviteStatus(null)

    // Try to look up the user by email
    const { data: userId } = await supabase.rpc('lookup_user_by_email', { p_email: email })

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
        setInviteStatus(`Error: ${error.message}`)
      } else {
        setInviteStatus(`Added ${email} as ${inviteRole}`)
        setInviteEmail('')
        loadData()
      }
    } else {
      // User doesn't exist — create a pending invite
      const { error } = await supabase
        .from('board_invites')
        .upsert({
          board_id: boardId,
          email,
          role: inviteRole,
          invited_by: (await supabase.auth.getUser()).data.user!.id,
        }, { onConflict: 'board_id,email' })

      if (error) {
        setInviteStatus(`Error: ${error.message}`)
      } else {
        setInviteStatus(`Invited ${email} (pending signup)`)
        setInviteEmail('')
        loadData()
      }
    }
  }

  async function handleRoleChange(memberId: string, memberUserId: string, newRole: BoardRole) {
    // Ownership transfer
    if (newRole === 'owner') {
      setTransferTarget(memberId)
      return
    }

    const { error } = await supabase
      .from('board_members')
      .update({ role: newRole })
      .eq('id', memberId)

    if (!error) {
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m))
    }
  }

  async function confirmTransferOwnership() {
    if (!transferTarget) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Set target as owner
    await supabase
      .from('board_members')
      .update({ role: 'owner' })
      .eq('id', transferTarget)

    // Set self as manager
    await supabase
      .from('board_members')
      .update({ role: 'manager' })
      .eq('board_id', boardId)
      .eq('user_id', user.id)

    setTransferTarget(null)
    loadData()
  }

  async function handleRemoveMember(memberId: string) {
    const { error } = await supabase
      .from('board_members')
      .delete()
      .eq('id', memberId)

    if (!error) {
      setMembers(prev => prev.filter(m => m.id !== memberId))
    }
  }

  async function handleDeleteInvite(inviteId: string) {
    const { error } = await supabase
      .from('board_invites')
      .delete()
      .eq('id', inviteId)

    if (!error) {
      setInvites(prev => prev.filter(i => i.id !== inviteId))
    }
  }

  async function handleGenerateLink() {
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

    if (!error && data) {
      setShareLink(data as BoardShareLink)
    }
  }

  async function handleDeactivateLink() {
    if (!shareLink) return

    const { error } = await supabase
      .from('board_share_links')
      .update({ is_active: false })
      .eq('id', shareLink.id)

    if (!error) {
      setShareLink(null)
    }
  }

  function copyLink() {
    if (!shareLink) return
    const url = `${window.location.origin}/board/join/${shareLink.token}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const tabStyle = (t: Tab): React.CSSProperties => ({
    padding: '8px 16px',
    cursor: 'pointer',
    border: 'none',
    background: tab === t ? '#2196F3' : 'transparent',
    color: tab === t ? '#fff' : '#666',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
  })

  const getRoleOptions = (currentRole: BoardRole) => {
    const options = [...ROLE_OPTIONS]
    if (isOwner) {
      options.unshift({ value: 'owner', label: 'Owner (transfer)' })
    }
    return options
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: '16px', padding: '24px',
          width: '500px', maxHeight: '80vh', overflow: 'auto',
          boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>Share Board</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#999' }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: '#f5f5f5', borderRadius: '8px', padding: '4px' }}>
          <button style={tabStyle('members')} onClick={() => setTab('members')}>Members</button>
          <button style={tabStyle('invite')} onClick={() => setTab('invite')}>Invite</button>
          <button style={tabStyle('link')} onClick={() => setTab('link')}>Link</button>
        </div>

        {loading ? (
          <p style={{ color: '#888', textAlign: 'center', padding: '20px' }}>Loading...</p>
        ) : (
          <>
            {/* Members Tab */}
            {tab === 'members' && (
              <div>
                {members.map(member => (
                  <div key={member.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 0', borderBottom: '1px solid #f0f0f0',
                  }}>
                    <div style={{ fontSize: '14px', color: '#333' }}>
                      {member.email}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {member.role === 'owner' && !isOwner ? (
                        <span style={{ fontSize: '13px', color: '#888', fontWeight: 500 }}>Owner</span>
                      ) : member.role === 'owner' && isOwner ? (
                        <span style={{ fontSize: '13px', color: '#888', fontWeight: 500 }}>Owner (you)</span>
                      ) : (
                        <>
                          <select
                            value={member.role}
                            onChange={e => handleRoleChange(member.id, member.user_id, e.target.value as BoardRole)}
                            style={{
                              padding: '4px 8px', fontSize: '13px', borderRadius: '6px',
                              border: '1px solid #ddd', outline: 'none',
                            }}
                          >
                            {getRoleOptions(member.role).map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleRemoveMember(member.id)}
                            style={{
                              background: 'none', border: 'none', color: '#d32f2f',
                              cursor: 'pointer', fontSize: '16px', padding: '0 4px',
                            }}
                            title="Remove member"
                          >
                            ×
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}

                {/* Pending invites section */}
                {invites.length > 0 && (
                  <>
                    <div style={{ fontSize: '12px', color: '#888', marginTop: '16px', marginBottom: '8px', fontWeight: 500 }}>
                      Pending Invites
                    </div>
                    {invites.map(invite => (
                      <div key={invite.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 0', borderBottom: '1px solid #f0f0f0',
                      }}>
                        <div style={{ fontSize: '14px', color: '#888' }}>
                          {invite.email}
                          <span style={{ fontSize: '11px', color: '#aaa', marginLeft: '8px' }}>
                            ({invite.role})
                          </span>
                        </div>
                        <button
                          onClick={() => handleDeleteInvite(invite.id)}
                          style={{
                            background: 'none', border: 'none', color: '#d32f2f',
                            cursor: 'pointer', fontSize: '16px', padding: '0 4px',
                          }}
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
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleInvite() }}
                    placeholder="Email address"
                    style={{
                      flex: 1, padding: '10px 12px', fontSize: '14px',
                      border: '1px solid #ddd', borderRadius: '8px', outline: 'none',
                    }}
                  />
                  <select
                    value={inviteRole}
                    onChange={e => setInviteRole(e.target.value as BoardRole)}
                    style={{
                      padding: '10px 12px', fontSize: '14px', borderRadius: '8px',
                      border: '1px solid #ddd', outline: 'none',
                    }}
                  >
                    {ROLE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleInvite}
                  disabled={!inviteEmail.trim()}
                  style={{
                    width: '100%', padding: '10px', fontSize: '14px', fontWeight: 500,
                    background: inviteEmail.trim() ? '#2196F3' : '#ccc',
                    color: '#fff', border: 'none', borderRadius: '8px',
                    cursor: inviteEmail.trim() ? 'pointer' : 'not-allowed',
                  }}
                >
                  Send Invite
                </button>
                {inviteStatus && (
                  <p style={{
                    marginTop: '12px', fontSize: '13px',
                    color: inviteStatus.startsWith('Error') ? '#d32f2f' : '#4CAF50',
                  }}>
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
                    <div style={{
                      padding: '12px', background: '#f5f5f5', borderRadius: '8px',
                      fontSize: '13px', color: '#555', wordBreak: 'break-all', marginBottom: '12px',
                    }}>
                      {`${typeof window !== 'undefined' ? window.location.origin : ''}/board/join/${shareLink.token}`}
                    </div>
                    <div style={{ fontSize: '13px', color: '#888', marginBottom: '12px' }}>
                      Anyone with this link joins as <strong>{shareLink.role}</strong>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={copyLink}
                        style={{
                          flex: 1, padding: '10px', fontSize: '14px', fontWeight: 500,
                          background: '#2196F3', color: '#fff', border: 'none', borderRadius: '8px',
                          cursor: 'pointer',
                        }}
                      >
                        {copied ? 'Copied!' : 'Copy Link'}
                      </button>
                      <button
                        onClick={handleDeactivateLink}
                        style={{
                          padding: '10px 16px', fontSize: '14px', fontWeight: 500,
                          background: 'none', color: '#d32f2f', border: '1px solid #d32f2f',
                          borderRadius: '8px', cursor: 'pointer',
                        }}
                      >
                        Deactivate
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize: '14px', color: '#666', marginBottom: '12px' }}>
                      Generate a shareable link. Anyone with the link can join the board.
                    </p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <select
                        value={linkRole}
                        onChange={e => setLinkRole(e.target.value as 'editor' | 'viewer')}
                        style={{
                          padding: '10px 12px', fontSize: '14px', borderRadius: '8px',
                          border: '1px solid #ddd', outline: 'none',
                        }}
                      >
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button
                        onClick={handleGenerateLink}
                        style={{
                          flex: 1, padding: '10px', fontSize: '14px', fontWeight: 500,
                          background: '#2196F3', color: '#fff', border: 'none', borderRadius: '8px',
                          cursor: 'pointer',
                        }}
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
          <div style={{
            position: 'fixed', inset: 0, zIndex: 400,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              background: '#fff', borderRadius: '12px', padding: '24px',
              width: '360px', boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
            }}>
              <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 600 }}>Transfer Ownership?</h3>
              <p style={{ fontSize: '14px', color: '#666', margin: '0 0 20px' }}>
                This will make the selected user the owner and change your role to manager. This action cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setTransferTarget(null)}
                  style={{
                    padding: '8px 16px', fontSize: '14px', background: 'none',
                    border: '1px solid #ccc', borderRadius: '8px', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmTransferOwnership}
                  style={{
                    padding: '8px 16px', fontSize: '14px', fontWeight: 500,
                    background: '#d32f2f', color: '#fff', border: 'none', borderRadius: '8px',
                    cursor: 'pointer',
                  }}
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
