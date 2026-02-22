/**
 * POST /api/errors — client-side error reporting stub.
 *
 * Accepts error payloads from the client and discards them for now.
 * Returns 200 immediately so callers are fire-and-forget.
 * Wire up a real error reporting service (Sentry, Datadog, etc.) here later.
 */
import { NextRequest, NextResponse } from 'next/server'

export async function POST(_req: NextRequest): Promise<NextResponse> {
  // Intentional no-op — consume and discard the body.
  // No error logging until a reporting service is configured.
  return NextResponse.json({ ok: true }, { status: 200 })
}
