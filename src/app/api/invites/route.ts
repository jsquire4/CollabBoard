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

async function sendBoardNotificationEmail(params: {
  to: string
  inviterName: string
  boardName: string
  role: string
  linkUrl: string
  linkLabel: string
  heading: string
  bodyText: string
}): Promise<{ error?: unknown }> {
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'Theorem <notifications@theoremai.app>'
  const { error } = await resend.emails.send({
    from: fromEmail,
    to: params.to,
    subject: `${params.inviterName} ${params.bodyText.toLowerCase()} "${params.boardName}"`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>${params.heading}</h2>
        <p><strong>${params.inviterName}</strong> ${params.bodyText} <strong>&ldquo;${params.boardName}&rdquo;</strong> as a <strong>${params.role}</strong>.</p>
        <p>
          <a href="${params.linkUrl}" style="display: inline-block; background: #1a1f36; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
            ${params.linkLabel}
          </a>
        </p>
        <p style="color: #666; font-size: 14px; margin-top: 24px;">
          If the button doesn't work, copy and paste this link:<br/>
          <a href="${params.linkUrl}">${params.linkUrl}</a>
        </p>
      </div>
    `,
  })
  return { error }
}

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

  // 4. Check if invitee is an existing user via SECURITY DEFINER RPC (auth.users not PostgREST-accessible)
  // Use user client so auth.uid() is set for the RPC's permission check; admin client has no user JWT
  const { data: existingUserId, error: lookupError } = await supabase
    .rpc('lookup_user_by_email', { p_board_id: boardId, p_email: email })

  if (lookupError) {
    console.error('[api/invites] Failed to look up user by email:', lookupError)
  }

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

    // Send notification email (fire-and-forget)
    let emailWarning: string | undefined
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : '')
    if (appUrl) {
      const { data: board } = await admin.from('boards').select('name').eq('id', boardId).maybeSingle()
      const boardName = escapeHtml(board?.name ?? 'a board')
      const inviterName = escapeHtml(user.user_metadata?.full_name ?? user.email ?? 'Someone')
      const safeRole = escapeHtml(role)
      const boardUrl = `${appUrl}/board/${boardId}`
      const { error: sendError } = await sendBoardNotificationEmail({
        to: email,
        inviterName,
        boardName,
        role: safeRole,
        linkUrl: boardUrl,
        linkLabel: 'Open Board',
        heading: "You've been added!",
        bodyText: 'added you to',
      })
      if (sendError) {
        console.error('[api/invites] Resend API error (existing user):', JSON.stringify(sendError, null, 2))
        emailWarning = 'Member added but notification email could not be sent'
      }
    }

    return Response.json({ outcome: 'added', ...(emailWarning && { emailWarning }) }, { status: 201 })
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
    const { error: sendError } = await sendBoardNotificationEmail({
      to: email,
      inviterName,
      boardName,
      role: safeRole,
      linkUrl: acceptUrl,
      linkLabel: 'Accept Invite',
      heading: "You've been invited!",
      bodyText: 'invited you to join',
    })
    if (sendError) {
      console.error('[api/invites] Resend API error:', JSON.stringify(sendError, null, 2))
      emailWarning = 'Invite created but email notification could not be sent'
    }
  } catch (err) {
    console.error('[api/invites] Failed to send email:', err)
    emailWarning = 'Invite created but email notification could not be sent'
  }

  return Response.json(
    { outcome: 'invited', inviteId: invite.id, ...(emailWarning && { emailWarning }) },
    { status: 201 }
  )
}
