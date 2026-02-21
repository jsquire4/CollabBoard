/**
 * GET /invite/accept?id=<invite-id>
 * Handles invite link clicks: verifies auth, validates the invite,
 * adds the user to the board, and redirects to the board page.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { UUID_RE } from '@/lib/api/uuidRe'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const inviteId = searchParams.get('id')
  const origin = process.env.NEXT_PUBLIC_APP_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : new URL(request.url).origin)

  // 1. Validate invite ID
  if (!inviteId || !UUID_RE.test(inviteId)) {
    return NextResponse.redirect(`${origin}/boards?error=invite-invalid`)
  }

  // 2. Check auth (safe-destructure to avoid NPE if data is null)
  const supabase = await createClient()
  const authResult = await supabase.auth.getUser()
  const user = authResult.data?.user ?? null

  if (!user) {
    // Redirect to login with returnTo so they come back after auth
    const returnTo = `/invite/accept?id=${inviteId}`
    return NextResponse.redirect(
      `${origin}/login?returnTo=${encodeURIComponent(returnTo)}`
    )
  }

  // 3. Look up the invite
  const admin = createAdminClient()
  const { data: invite, error: inviteError } = await admin
    .from('board_invites')
    .select('id, board_id, email, role')
    .eq('id', inviteId)
    .single()

  if (inviteError || !invite) {
    return NextResponse.redirect(`${origin}/boards?error=invite-invalid`)
  }

  // 4. Validate board_id from invite is a UUID (defense against malformed DB data)
  if (!UUID_RE.test(invite.board_id)) {
    console.error('[invite/accept] Invalid board_id in invite:', invite.board_id)
    return NextResponse.redirect(`${origin}/boards?error=invite-invalid`)
  }

  // 5. Check email matches
  if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
    return NextResponse.redirect(`${origin}/boards?error=invite-email-mismatch`)
  }

  // 6. Accept: upsert into board_members
  const { error: memberError } = await admin
    .from('board_members')
    .upsert({
      board_id: invite.board_id,
      user_id: user.id,
      role: invite.role,
      can_use_agents: invite.role !== 'viewer',
    }, { onConflict: 'board_id,user_id' })

  if (memberError) {
    console.error('[invite/accept] Failed to add member:', memberError)
    return NextResponse.redirect(`${origin}/boards?error=invite-failed`)
  }

  // 7. Delete the invite (it's been accepted)
  const { error: deleteError } = await admin
    .from('board_invites')
    .delete()
    .eq('id', inviteId)

  if (deleteError) {
    console.error('[invite/accept] Failed to delete invite after acceptance:', deleteError)
  }

  // 8. Redirect to the board (full page load for Realtime WebSocket)
  return NextResponse.redirect(`${origin}/board/${invite.board_id}`)
}
