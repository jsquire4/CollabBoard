/**
 * Fly Machines API helpers — create, start, stop, wait for state.
 * Used in production to manage per-board agent containers.
 */

const FLY_API_TOKEN = process.env.FLY_API_TOKEN || ''
const FLY_APP_NAME = process.env.FLY_APP_NAME || 'collabboard-agent'
const FLY_API_BASE = 'https://api.machines.dev/v1'

interface MachineConfig {
  boardId: string
  env: Record<string, string>
}

interface Machine {
  id: string
  state: string
  private_ip: string
}

async function flyFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${FLY_API_BASE}/apps/${FLY_APP_NAME}${path}`, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(30000),
    headers: {
      Authorization: `Bearer ${FLY_API_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

export async function createMachine(config: MachineConfig): Promise<Machine> {
  const res = await flyFetch('/machines', {
    method: 'POST',
    body: JSON.stringify({
      name: `board-${config.boardId.slice(0, 8)}`,
      config: {
        image: `registry.fly.io/${FLY_APP_NAME}:latest`,
        env: {
          ...config.env,
          BOARD_ID: config.boardId,
        },
        services: [{
          ports: [{ port: 8080, handlers: ['http'] }],
          protocol: 'tcp',
          internal_port: 8080,
        }],
        auto_destroy: true,
        restart: { policy: 'on-failure', max_retries: 3 },
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Failed to create Fly machine: ${res.status} ${body}`)
  }

  return res.json()
}

export async function startMachine(machineId: string): Promise<void> {
  const res = await flyFetch(`/machines/${machineId}/start`, { method: 'POST' })
  if (!res.ok) {
    throw new Error(`Failed to start machine ${machineId}: ${res.status}`)
  }
}

export async function stopMachine(machineId: string): Promise<void> {
  const res = await flyFetch(`/machines/${machineId}/stop`, { method: 'POST' })
  if (!res.ok) {
    throw new Error(`Failed to stop machine ${machineId}: ${res.status}`)
  }
}

export async function waitForState(machineId: string, state: string, timeoutMs = 30000): Promise<void> {
  const timeoutSeconds = Math.ceil(timeoutMs / 1000)
  const res = await flyFetch(`/machines/${machineId}/wait?state=${state}&timeout=${timeoutSeconds}`, {
    method: 'GET',
    signal: AbortSignal.timeout(timeoutMs + 5000),
  })
  if (!res.ok) {
    throw new Error(`Machine ${machineId} did not reach state ${state} in ${timeoutMs}ms`)
  }
}

export function getMachineUrl(machineId: string): string {
  return `http://${machineId}.vm.${FLY_APP_NAME}.internal:8080`
}

export function getGatewayUrl(): string {
  // Gateway is the app's default URL — always-on machine
  return process.env.NODE_ENV === 'production'
    ? `https://${FLY_APP_NAME}.fly.dev`
    : `http://localhost:8080`
}
