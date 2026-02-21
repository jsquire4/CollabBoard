'use client'

import { useState } from 'react'
import { BoardRole } from '@/types/sharing'
import { useShareDialog } from '@/hooks/board/useShareDialog'

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
  const [tab, setTab] = useState<Tab>('members')

  const {
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
    handleRemoveMember,
    handleDeleteInvite,
    handleGenerateLink,
    handleDeactivateLink,
    copyLink,
    confirmTransferOwnership,
  } = useShareDialog(boardId, userRole)

  const isOwner = userRole === 'owner'

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
                    className="flex items-center justify-between border-b border-parchment-border dark:border-white/10 py-2.5"
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
                            className="rounded p-1 text-red-600 transition hover:bg-red-50 dark:hover:bg-red-900/20"
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
                        className="flex items-center justify-between border-b border-parchment-border dark:border-white/10 py-2"
                      >
                        <div className="text-sm text-charcoal/70 dark:text-parchment/60">
                          {invite.email}
                          <span className="ml-2 text-xs text-charcoal/60 dark:text-parchment/40">({invite.role})</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteInvite(invite.id)}
                          className="rounded p-1 text-red-600 transition hover:bg-red-50 dark:hover:bg-red-900/20"
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
                        className="rounded-lg border border-red-600 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:hover:bg-red-900/20"
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
