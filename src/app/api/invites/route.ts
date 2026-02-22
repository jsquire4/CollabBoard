/**
 * POST /api/invites — invite a user to a board.
 * If the invitee is an existing user, add them directly to board_members.
 * If not, create a board_invite record and send an email via Resend.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireBoardMember } from '@/lib/supabase/requireBoardMember'
import { UUID_RE } from '@/lib/api/uuidRe'
import { resend } from '@/lib/resend'

const VALID_ROLES = new Set(['manager', 'editor', 'viewer'])

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function POST(request: NextRequest) {
  // 1. Auth
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parse + validate body
  let body: { boardId?: string; email?: string; role?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { boardId, email: rawEmail, role } = body
  if (!boardId || !UUID_RE.test(boardId)) {
    return Response.json({ error: 'Invalid or missing boardId' }, { status: 400 })
  }
  // Trim before validation so whitespace-padded emails aren't rejected
  const trimmedEmail = rawEmail?.trim() ?? ''
  if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return Response.json({ error: 'Invalid or missing email' }, { status: 400 })
  }
  if (!role || !VALID_ROLES.has(role)) {
    return Response.json({ error: 'Invalid role. Must be manager, editor, or viewer' }, { status: 400 })
  }

  const email = trimmedEmail.toLowerCase()

  // 3. Authorization: caller must be owner or manager
  const callerMember = await requireBoardMember(supabase, boardId, user.id, { allowedRoles: ['owner', 'manager'] })
  if (!callerMember) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (err) {
    console.error('[api/invites] Admin client unavailable:', err)
    return Response.json({ error: 'Service unavailable' }, { status: 503 })
  }

  // 4. Check if invitee is an existing user (query auth.users directly via admin client)
  const { data: existingUser, error: lookupError } = await admin
    .from('auth.users')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (lookupError) {
    console.error('[api/invites] Failed to look up user by email:', lookupError)
  }

  const existingUserId = existingUser?.id ?? null

  if (existingUserId) {
    // Add directly to board_members
    const { error: memberError } = await admin
      .from('board_members')
      .upsert({
        board_id: boardId,
        user_id: existingUserId,
        role,
        can_use_agents: role !== 'viewer',
      }, { onConflict: 'board_id,user_id' })

    if (memberError) {
      console.error('[api/invites] Failed to add member:', memberError)
      return Response.json({ error: 'Failed to add member' }, { status: 500 })
    }

    return Response.json({ outcome: 'added' }, { status: 201 })
  }

  // 5. New user: create invite
  const { data: invite, error: inviteError } = await admin
    .from('board_invites')
    .upsert({
      board_id: boardId,
      email,
      role,
      invited_by: user.id,
    }, { onConflict: 'board_id,email' })
    .select()
    .single()

  if (inviteError || !invite) {
    console.error('[api/invites] Failed to create invite:', inviteError)
    return Response.json({ error: 'Failed to create invite' }, { status: 500 })
  }

  // 6. Fetch board name for email
  const { data: board } = await admin
    .from('boards')
    .select('name')
    .eq('id', boardId)
    .maybeSingle()

  const boardName = escapeHtml(board?.name ?? 'a board')
  const inviterName = escapeHtml(user.user_metadata?.full_name ?? user.email ?? 'Someone')
  const safeRole = escapeHtml(role)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : '')
  if (!appUrl) {
    console.error('[api/invites] NEXT_PUBLIC_APP_URL is not set — cannot construct invite link')
    return Response.json(
      { outcome: 'invited', inviteId: invite.id, emailWarning: 'Email not sent: app URL not configured' },
      { status: 201 }
    )
  }
  const acceptUrl = `${appUrl}/invite/accept?id=${invite.id}`

  // 7. Send email (fire-and-forget — don't fail the invite on email error)
  let emailWarning: string | undefined
  try {
    await resend.emails.send({
      from: 'Theorem <notifications@theorem.app>',
      to: email,
      subject: `${inviterName} invited you to "${boardName}"`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>You've been invited!</h2>
          <p><strong>${inviterName}</strong> invited you to join <strong>&ldquo;${boardName}&rdquo;</strong> as a <strong>${safeRole}</strong>.</p>
          <p>
            <a href="${acceptUrl}" style="display: inline-block; background: #1a1f36; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
              Accept Invite
            </a>
          </p>
          <p style="color: #666; font-size: 14px; margin-top: 24px;">
            If the button doesn't work, copy and paste this link:<br/>
            <a href="${acceptUrl}">${acceptUrl}</a>
          </p>
        </div>
      `,
    })
  } catch (err) {
    console.error('[api/invites] Failed to send email:', err)
    emailWarning = 'Invite created but email notification could not be sent'
  }

  return Response.json(
    { outcome: 'invited', inviteId: invite.id, ...(emailWarning && { emailWarning }) },
    { status: 201 }
  )
}
