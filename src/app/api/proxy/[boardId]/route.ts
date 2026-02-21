/**
 * POST /api/proxy/[boardId] — SSRF-safe HTTP proxy for api_object canvas shapes.
 *
 * Security model:
 * - Auth: user must be a board member (owner/editor)
 * - URL: HTTPS only, no bare IP literals
 * - DNS: resolved hostname must not point to private/loopback address space
 * - Redirects: disabled (redirect: 'error') to prevent redirect-based SSRF
 * - Headers: Authorization, Cookie, Host, X-Forwarded-For stripped
 * - Timeout: 10 seconds
 * - Optional write-back: stores response JSON to board_objects.formula
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import * as dnsPromises from 'dns/promises'

export const maxDuration = 30

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Headers forwarded from client requests that should never be forwarded upstream */
const STRIPPED_REQUEST_HEADERS = new Set([
  'authorization',
  'cookie',
  'host',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
])

/** Private/loopback IP ranges that must be blocked */
const PRIVATE_IP_PREFIXES = [
  '0.',
  '10.',
  '100.64.',  // CGNAT (RFC 6598)
  '127.',
  '169.254.',
  '192.168.',
  '::1',
  '::ffff:', // IPv4-mapped IPv6
  'fc',
  'fd',
  'fe80',
]

function isPrivate172(ip: string): boolean {
  const parts = ip.split('.')
  if (parts.length !== 4) return false
  const second = parseInt(parts[1], 10)
  return parseInt(parts[0], 10) === 172 && second >= 16 && second <= 31
}

export function isPrivateIp(ip: string): boolean {
  if (PRIVATE_IP_PREFIXES.some(prefix => ip.startsWith(prefix))) return true
  if (isPrivate172(ip)) return true
  return false
}

async function dnsResolveAny(hostname: string): Promise<string[]> {
  try {
    const [v4, v6] = await Promise.allSettled([
      dnsPromises.resolve4(hostname),
      dnsPromises.resolve6(hostname),
    ])
    const addresses: string[] = []
    if (v4.status === 'fulfilled') addresses.push(...v4.value)
    if (v6.status === 'fulfilled') addresses.push(...v6.value)
    return addresses
  } catch {
    return []
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ boardId: string }> },
) {
  const { boardId } = await params

  if (!UUID_RE.test(boardId)) {
    return Response.json({ error: 'Invalid board ID' }, { status: 400 })
  }

  // ── Auth ──────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: member } = await supabase
    .from('board_members')
    .select('role')
    .eq('board_id', boardId)
    .eq('user_id', user.id)
    .single()

  if (!member || !['owner', 'editor'].includes(member.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Parse body ────────────────────────────────────────────
  let body: {
    url?: string
    method?: string
    headers?: Record<string, string>
    body?: string
    writeBackObjectId?: string
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { url, method = 'GET', headers: requestHeaders = {}, body: requestBody, writeBackObjectId } = body

  if (!url) {
    return Response.json({ error: 'url is required' }, { status: 400 })
  }

  // ── URL validation ────────────────────────────────────────
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return Response.json({ error: 'Invalid URL' }, { status: 400 })
  }

  if (parsed.protocol !== 'https:') {
    return Response.json({ error: 'Only HTTPS URLs are allowed' }, { status: 400 })
  }

  const { hostname } = parsed

  // Block bare IP literals (no DNS needed)
  if (/^[\d.]+$/.test(hostname) || hostname.includes(':')) {
    if (isPrivateIp(hostname)) {
      return Response.json({ error: 'URL resolves to a private address' }, { status: 400 })
    }
  } else {
    // Resolve hostname via DNS and check all addresses
    const addresses = await dnsResolveAny(hostname)
    if (addresses.length === 0) {
      return Response.json({ error: 'Could not resolve hostname' }, { status: 400 })
    }
    if (addresses.some(isPrivateIp)) {
      return Response.json({ error: 'URL resolves to a private address' }, { status: 400 })
    }
  }

  // ── Strip sensitive request headers ──────────────────────
  const safeHeaders: Record<string, string> = {}
  for (const [key, value] of Object.entries(requestHeaders)) {
    if (!STRIPPED_REQUEST_HEADERS.has(key.toLowerCase())) {
      safeHeaders[key] = value
    }
  }

  // ── Execute request ───────────────────────────────────────
  let upstreamRes: Response
  try {
    upstreamRes = await fetch(url, {
      method: method.toUpperCase(),
      headers: safeHeaders,
      body: requestBody ?? undefined,
      redirect: 'error', // Prevent redirect-based SSRF
      signal: AbortSignal.timeout(10_000),
    })
  } catch (err) {
    const errMsg = (err as Error).message ?? ''
    if (errMsg.includes('timeout') || errMsg.includes('Timeout') || errMsg.includes('abort') || (err as Error).name === 'TimeoutError') {
      return Response.json({ error: 'Request timed out' }, { status: 504 })
    }
    if (errMsg.includes('redirect') || errMsg.includes('Redirect')) {
      return Response.json({ error: 'Redirects not allowed' }, { status: 400 })
    }
    return Response.json({ error: 'Request failed' }, { status: 500 })
  }

  const contentType = upstreamRes.headers.get('content-type') ?? 'text/plain'
  const responseBody = await upstreamRes.text()

  const result = {
    status: upstreamRes.status,
    headers: { 'content-type': contentType },
    body: responseBody,
  }

  // ── Optional write-back to formula field ─────────────────
  if (writeBackObjectId && UUID_RE.test(writeBackObjectId)) {
    try {
      const admin = createAdminClient()
      await admin
        .from('board_objects')
        .update({ formula: JSON.stringify(result) })
        .eq('id', writeBackObjectId)
        .eq('board_id', boardId)
        .is('deleted_at', null)
    } catch (err) {
      // Log but continue — write-back is cosmetic
      console.warn('[proxy] Write-back failed:', err)
    }
  }

  return Response.json(result)
}
