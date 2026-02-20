/**
 * POST /api/agent/[boardId]/start — start a dedicated container for a board.
 * Returns immediately with gateway URL; dedicated container starts in background.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ensureBoardContainer, updateContainerStatus } from '@/lib/agent-registry'
import { createMachine, waitForState, getMachineUrl, getGatewayUrl } from '@/lib/fly-machines'

const AGENT_INTERNAL_SECRET = process.env.AGENT_INTERNAL_SECRET ?? ''

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ boardId: string }> },
) {
  const { boardId } = await params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(boardId)) {
    return new Response(JSON.stringify({ error: 'Invalid board ID' }), { status: 400 })
  }

  // Authenticate user
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  // Verify board membership
  const { data: member } = await supabase
    .from('board_members')
    .select('role')
    .eq('board_id', boardId)
    .eq('user_id', user.id)
    .single()

  if (!member || !['owner', 'editor'].includes(member.role)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }

  try {
    const container = await ensureBoardContainer(boardId)

    if (!container.is_new) {
      // Container already exists
      return Response.json({
        gatewayUrl: getGatewayUrl(),
        dedicatedUrl: container.machine_url,
        status: container.status,
      })
    }

    // Start dedicated container in background (don't block response)
    const gatewayUrl = getGatewayUrl()

    if (process.env.NODE_ENV === 'production' && process.env.FLY_API_TOKEN) {
      // Production: create Fly machine
      startDedicatedContainer(boardId).catch(err => {
        console.error(`[start] Failed to start dedicated container for ${boardId}:`, err)
      })
    }

    return Response.json({
      gatewayUrl,
      dedicatedUrl: null,
      status: 'starting',
    })
  } catch (error) {
    console.error('[start] Error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to start container' }),
      { status: 500 },
    )
  }
}

async function startDedicatedContainer(boardId: string) {
  try {
    const machine = await createMachine({
      boardId,
      env: {
        BOARD_ID: boardId,
      },
    })

    await waitForState(machine.id, 'started', 30000)

    const machineUrl = getMachineUrl(machine.id)
    await updateContainerStatus(boardId, 'running', machineUrl, machine.id)
  } catch (error) {
    await updateContainerStatus(boardId, 'stopped')
    throw error
  }
}
