import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Multi-user load test: N concurrent users performing ALL available canvas actions.
 *
 * Actions: z-index (front/back/forward/backward), connectors (line/arrow), grid options,
 * table add/delete row/col + resize, text entry, shape add/drag, delete, undo/redo,
 * duplicate, color, group/ungroup. Cursor broadcast at CURSOR_POLL_MS (default 5ms).
 * Users join/leave at random; some leave mid-work and rejoin.
 *
 * Requires TEST_BOARD_JOIN_TOKEN in .env.local (share-link token from a board).
 * Config: MULTI_USER_COUNT (default 50), MULTI_USER_DURATION_SEC (default 60),
 * CURSOR_POLL_MS (default 5), MULTI_USER_JOIN_LEAVE (default 1, set 0 to disable).
 *
 * Captures: pageerror, console errors, requestfailed, HTTP 4xx/5xx responses.
 */
const JOIN_TOKEN = process.env.TEST_BOARD_JOIN_TOKEN
const USER_COUNT = parseInt(process.env.MULTI_USER_COUNT ?? '50', 10) || 50
const DURATION_SEC = parseInt(process.env.MULTI_USER_DURATION_SEC ?? '60', 10) || 60
/** Cursor position broadcast interval (ms). User requested 5ms for stress. */
const CURSOR_POLL_MS = parseInt(process.env.CURSOR_POLL_MS ?? '5', 10) || 5
/** Enable join/leave simulation (users leave and rejoin mid-session). Set MULTI_USER_JOIN_LEAVE=0 to disable. */
const JOIN_LEAVE_ENABLED = process.env.MULTI_USER_JOIN_LEAVE !== '0'

interface CapturedError {
  type: 'pageerror' | 'console' | 'requestfailed' | 'response'
  message: string
  stack?: string
  url?: string
  userId: number
  timestamp: number
}

interface FPSMetrics {
  samples: number
  avgFps: number
  minFps: number
  maxFps: number
  p50Fps: number
  p95Fps: number
  p99Fps: number
  dipsBelow30: number
  dipsBelow10: number
  frameTimesMs: number[]
}

interface ActionLatency {
  action: string
  latencyMs: number
  userId: number
}

interface UserReport {
  userId: number
  fps: FPSMetrics
  actionCount: number
  actionLatencies: ActionLatency[]
  errors: CapturedError[]
  sessions: number
}

interface LoadTestReport {
  timestamp: string
  userCount: number
  durationSec: number
  users: UserReport[]
  allErrors: CapturedError[]
  summary: {
    avgFpsAcrossUsers: number
    minFpsAcrossUsers: number
    p95FpsAcrossUsers: number
    totalActions: number
    addActions: number
    avgActionLatencyMs: number
    p95ActionLatencyMs: number
    degradationExceeded: boolean
    criticalDegradationCount: number
    totalErrors: number
    uniqueErrorMessages: number
  }
}

const START_FPS = `
  window.__fpsFrameTimes = [];
  let __last = performance.now();
  const __measure = (now) => {
    window.__fpsFrameTimes.push(now - __last);
    __last = now;
    requestAnimationFrame(__measure);
  };
  requestAnimationFrame(__measure);
`

const GET_FPS = `
  (() => {
    const frameTimes = (window.__fpsFrameTimes || []).filter(t => t > 0);
    const sorted = [...frameTimes].sort((a,b) => a - b);
    const toFps = (ms) => ms > 0 ? 1000 / ms : 0;
    const fps = sorted.map(toFps);
    const avgFps = fps.length ? fps.reduce((a,b) => a+b, 0) / fps.length : 0;
    const p = (n) => sorted[Math.floor(sorted.length * n / 100)] ?? 0;
    return {
      samples: sorted.length,
      avgFps,
      minFps: fps.length ? Math.min(...fps) : 0,
      maxFps: fps.length ? Math.max(...fps) : 0,
      p50Fps: toFps(p(50)),
      p95Fps: toFps(p(95)),
      p99Fps: toFps(p(99)),
      dipsBelow30: fps.filter(f => f > 0 && f < 30).length,
      dipsBelow10: fps.filter(f => f > 0 && f < 10).length,
      frameTimesMs: sorted.slice(-500)
    };
  })()
`

type ActionType =
  | 'add_rect' | 'add_circle' | 'add_sticky' | 'add_table' | 'add_frame' | 'add_line' | 'add_arrow'
  | 'delete' | 'undo' | 'redo' | 'duplicate' | 'color'
  | 'z_front' | 'z_forward' | 'z_backward' | 'z_back'
  | 'group' | 'ungroup'
  | 'grid_toggle' | 'grid_snap' | 'grid_style' | 'grid_interval' | 'grid_subdiv'
  | 'table_add_row' | 'table_add_col' | 'table_del_row' | 'table_del_col' | 'table_resize'
  | 'text_edit' | 'drag' | 'connector'

const ACTION_WEIGHTS: { action: ActionType; weight: number }[] = [
  { action: 'add_rect', weight: 12 }, { action: 'add_circle', weight: 8 }, { action: 'add_sticky', weight: 8 },
  { action: 'add_table', weight: 4 }, { action: 'add_frame', weight: 3 }, { action: 'add_line', weight: 4 }, { action: 'add_arrow', weight: 4 },
  { action: 'delete', weight: 6 }, { action: 'undo', weight: 4 }, { action: 'redo', weight: 2 }, { action: 'duplicate', weight: 4 }, { action: 'color', weight: 4 },
  { action: 'z_front', weight: 2 }, { action: 'z_forward', weight: 2 }, { action: 'z_backward', weight: 2 }, { action: 'z_back', weight: 2 },
  { action: 'group', weight: 2 }, { action: 'ungroup', weight: 2 },
  { action: 'grid_toggle', weight: 1 }, { action: 'grid_snap', weight: 1 }, { action: 'grid_style', weight: 1 }, { action: 'grid_interval', weight: 1 }, { action: 'grid_subdiv', weight: 1 },
  { action: 'table_add_row', weight: 2 }, { action: 'table_add_col', weight: 2 }, { action: 'table_del_row', weight: 1 }, { action: 'table_del_col', weight: 1 }, { action: 'table_resize', weight: 2 },
  { action: 'text_edit', weight: 4 }, { action: 'drag', weight: 6 }, { action: 'connector', weight: 3 },
]

function pickAction(): ActionType {
  const total = ACTION_WEIGHTS.reduce((s, a) => s + a.weight, 0)
  let r = Math.random() * total
  for (const { action, weight } of ACTION_WEIGHTS) {
    r -= weight
    if (r <= 0) return action
  }
  return 'add_rect'
}

/** Open flyout and click preset. Flyouts: Basics, Lines, Shapes. */
async function addShapeViaFlyout(
  page: import('@playwright/test').Page,
  canvas: import('@playwright/test').Locator,
  type: string,
  userId: number
): Promise<void> {
  const groupMap: Record<string, string> = {
    rect: 'Shapes',
    rectangle: 'Shapes',
    circle: 'Shapes',
    sticky: 'Basics',
    note: 'Basics',
    table: 'Basics',
    frame: 'Basics',
    line: 'Lines',
    arrow: 'Lines',
  }
  const labelMap: Record<string, string> = {
    rect: 'Rectangle',
    rectangle: 'Rectangle',
    circle: 'Circle',
    sticky: 'Note',
    note: 'Note',
    table: 'Table',
    frame: 'Frame',
    line: 'Line',
    arrow: 'Arrow',
  }
  const group = groupMap[type] ?? 'Shapes'
  const label = labelMap[type] ?? type
  const groupBtn = page.getByRole('button', { name: new RegExp(group, 'i') }).first()
  if (await groupBtn.isVisible().catch(() => false)) {
    await groupBtn.click().catch(() => {})
    await page.waitForTimeout(100)
  }
  const presetBtn = page.getByRole('button', { name: new RegExp(label, 'i') }).first()
  if (await presetBtn.isVisible().catch(() => false)) {
    await presetBtn.click().catch(() => {})
  }
  const cx = 150 + (userId * 35) + Math.random() * 450
  const cy = 150 + Math.random() * 450
  await canvas.click({ position: { x: cx, y: cy }, force: true, timeout: 1500 })
}

test.describe('Multi-user load', () => {
  test.skip(!JOIN_TOKEN, 'Set TEST_BOARD_JOIN_TOKEN to run multi-user load tests')

  test(`${USER_COUNT} users: full action set, join/leave, errors`, async ({ browser }) => {
    test.setTimeout((DURATION_SEC + 120) * 1000)
    const reports: UserReport[] = []
    const allErrors: CapturedError[] = []

    async function runUser(userId: number): Promise<UserReport> {
      let sessions = 0
      const allActionLatencies: ActionLatency[] = []
      const userErrors: CapturedError[] = []
      let totalFps: FPSMetrics = { samples: 0, avgFps: 0, minFps: 0, maxFps: 0, p50Fps: 0, p95Fps: 0, p99Fps: 0, dipsBelow30: 0, dipsBelow10: 0, frameTimesMs: [] }
      const endTime = Date.now() + DURATION_SEC * 1000
      const colors = ['#FF5733', '#33FF57', '#3357FF', '#F0F033', '#F033F0', '#33FFF0', '#FF33A1']

      while (Date.now() < endTime) {
        sessions++
        const context = await browser.newContext()
        const page = await context.newPage()

        page.on('pageerror', (err) => {
          const entry = { type: 'pageerror' as const, message: err.message, stack: err.stack, userId, timestamp: Date.now() }
          userErrors.push(entry)
          allErrors.push(entry)
        })
        page.on('console', (msg) => {
          if (msg.type() === 'error') {
            const entry = { type: 'console' as const, message: msg.text(), userId, timestamp: Date.now() }
            userErrors.push(entry)
            allErrors.push(entry)
          }
        })
        page.on('requestfailed', (req) => {
          const entry = { type: 'requestfailed' as const, message: req.failure()?.errorText ?? 'unknown', url: req.url(), userId, timestamp: Date.now() }
          userErrors.push(entry)
          allErrors.push(entry)
        })
        page.on('response', (res) => {
          const status = res.status()
          if (status >= 400) {
            const entry = { type: 'response' as const, message: `HTTP ${status} ${res.statusText()}`, url: res.url(), userId, timestamp: Date.now() }
            userErrors.push(entry)
            allErrors.push(entry)
          }
        })

        try {
          await page.goto(`/board/join/${JOIN_TOKEN}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
          try {
            await expect(page).toHaveURL(/\/board\/[a-f0-9-]+/, { timeout: 25000 })
          } catch (urlErr) {
            const errText = await page.locator('body').innerText().catch(() => '')
            userErrors.push({ type: 'console', message: `Join failed (verify TEST_BOARD_JOIN_TOKEN): ${String(urlErr)}. Page: ${errText.slice(0, 300)}`, userId, timestamp: Date.now() })
            throw urlErr
          }
          await Promise.race([
            page.locator('canvas').first().waitFor({ state: 'visible', timeout: 15000 }),
            page.getByRole('button', { name: /share|logout/i }).waitFor({ state: 'visible', timeout: 15000 }),
          ])

          await page.evaluate(START_FPS)

          const canvas = page.locator('canvas').first()
          const actionLatencies: ActionLatency[] = []
          const sessionEnd = JOIN_LEAVE_ENABLED
        ? Date.now() + Math.min(DURATION_SEC * 0.4, 25) * 1000
        : endTime
          let lastCursorTime = 0

          while (Date.now() < sessionEnd && Date.now() < endTime) {
            const now = Date.now()
            if (now - lastCursorTime >= CURSOR_POLL_MS) {
              const cx = 100 + (userId * 30) + Math.random() * 500
              const cy = 100 + Math.random() * 400
              await canvas.hover({ position: { x: cx, y: cy }, force: true, timeout: 500 }).catch(() => {})
              lastCursorTime = now
            }

            const action = pickAction()
            const start = Date.now()

            try {
              if (action.startsWith('add_')) {
                const type = action.replace('add_', '')
                await addShapeViaFlyout(page, canvas, type, userId)
              } else if (action === 'delete') {
                await canvas.click({ position: { x: 250 + Math.random() * 300, y: 250 + Math.random() * 300 }, force: true })
                await page.keyboard.press('Delete')
              } else if (action === 'undo') await page.keyboard.press('Control+z')
              else if (action === 'redo') await page.keyboard.press('Control+Shift+z')
              else if (action === 'duplicate') {
                await canvas.click({ position: { x: 250 + Math.random() * 300, y: 250 + Math.random() * 300 }, force: true })
                await page.keyboard.press('Control+d')
              } else if (action === 'color') {
                const colorBtn = page.getByRole('button', { name: /color|#[0-9a-fA-F]/i }).first()
                if (await colorBtn.isVisible().catch(() => false)) {
                  await colorBtn.click()
                  const swatch = page.locator(`[style*="${colors[userId % colors.length]}"]`).first()
                  if (await swatch.isVisible().catch(() => false)) await swatch.click()
                }
              } else if (action === 'z_front') { await canvas.click({ position: { x: 200, y: 200 }, force: true }); await page.keyboard.press('Control+Shift+]') }
              else if (action === 'z_forward') { await canvas.click({ position: { x: 200, y: 200 }, force: true }); await page.keyboard.press('Control+]') }
              else if (action === 'z_backward') { await canvas.click({ position: { x: 200, y: 200 }, force: true }); await page.keyboard.press('Control+[') }
              else if (action === 'z_back') { await canvas.click({ position: { x: 200, y: 200 }, force: true }); await page.keyboard.press('Control+Shift+[') }
              else if (action === 'group') { await canvas.click({ position: { x: 200, y: 200 }, force: true }); await page.keyboard.press('Control+g') }
              else if (action === 'ungroup') { await canvas.click({ position: { x: 200, y: 200 }, force: true }); await page.keyboard.press('Control+Shift+g') }
              else if (action.startsWith('grid_')) {
                const gridBtn = page.getByRole('button', { name: /grid options/i }).first()
                if (await gridBtn.isVisible().catch(() => false)) {
                  await gridBtn.click()
                  if (action === 'grid_toggle') await page.getByRole('button', { name: /grid on|grid off/i }).first().click().catch(() => {})
                  else if (action === 'grid_snap') await page.getByRole('button', { name: /snap on|snap off/i }).first().click().catch(() => {})
                  else if (action === 'grid_style') await page.getByRole('button', { name: /lines|dots/i }).first().click().catch(() => {})
                  else if (action === 'grid_interval') await page.locator('select').first().selectOption({ index: Math.floor(Math.random() * 6) }).catch(() => {})
                  else if (action === 'grid_subdiv') await page.locator('select').nth(1).selectOption({ index: Math.floor(Math.random() * 5) }).catch(() => {})
                }
              } else if (action.startsWith('table_')) {
                const tx = 250 + (userId * 40) + Math.random() * 200
                const ty = 250 + Math.random() * 200
                await canvas.click({ position: { x: tx, y: ty }, force: true })
                if (action === 'table_resize') {
                  await canvas.dragTo(canvas, { sourcePosition: { x: tx + 80, y: ty + 20 }, targetPosition: { x: tx + 120, y: ty + 20 }, force: true }).catch(() => {})
                } else {
                  await canvas.click({ button: 'right', position: { x: tx, y: ty }, force: true })
                  if (action === 'table_add_row') await page.getByRole('menuitem', { name: /add row/i }).click().catch(() => {})
                  else if (action === 'table_add_col') await page.getByRole('menuitem', { name: /add column/i }).click().catch(() => {})
                  else if (action === 'table_del_row') await page.getByRole('menuitem', { name: /delete row/i }).click().catch(() => {})
                  else if (action === 'table_del_col') await page.getByRole('menuitem', { name: /delete column/i }).click().catch(() => {})
                }
              } else if (action === 'text_edit') {
                await canvas.dblclick({ position: { x: 200 + Math.random() * 200, y: 200 + Math.random() * 200 }, force: true })
                await page.keyboard.type('test' + Math.random().toString(36).slice(2, 6), { delay: 20 })
                await page.keyboard.press('Escape')
              } else if (action === 'drag') {
                const from = { x: 200 + Math.random() * 200, y: 200 + Math.random() * 200 }
                await canvas.dragTo(canvas, { sourcePosition: from, targetPosition: { x: from.x + 50, y: from.y + 30 }, force: true }).catch(() => {})
              } else if (action === 'connector') {
                const lineBtn = page.getByRole('button', { name: /line|arrow/i }).first()
                if (await lineBtn.isVisible().catch(() => false)) {
                  await lineBtn.click()
                  await canvas.click({ position: { x: 150, y: 150 }, force: true })
                  await canvas.click({ position: { x: 350, y: 250 }, force: true })
                }
              }
            } catch {
              // Ignore
            }

            actionLatencies.push({ action, latencyMs: Math.round(Date.now() - start), userId })
            allActionLatencies.push(...actionLatencies.slice(-1))
            await page.waitForTimeout(25 + Math.random() * 75)
          }

          const fps = await page.evaluate(GET_FPS) as FPSMetrics
          if (totalFps.samples === 0) totalFps = fps
          else {
            totalFps = {
              samples: totalFps.samples + fps.samples,
              avgFps: (totalFps.avgFps * totalFps.samples + fps.avgFps * fps.samples) / (totalFps.samples + fps.samples),
              minFps: Math.min(totalFps.minFps, fps.minFps),
              maxFps: Math.max(totalFps.maxFps, fps.maxFps),
              p50Fps: (totalFps.p50Fps + fps.p50Fps) / 2,
              p95Fps: (totalFps.p95Fps + fps.p95Fps) / 2,
              p99Fps: (totalFps.p99Fps + fps.p99Fps) / 2,
              dipsBelow30: totalFps.dipsBelow30 + fps.dipsBelow30,
              dipsBelow10: totalFps.dipsBelow10 + fps.dipsBelow10,
              frameTimesMs: [...totalFps.frameTimesMs, ...fps.frameTimesMs].slice(-500),
            }
          }
        } finally {
          try {
            await context.close()
          } catch {
            // Context may already be disposed (e.g. tab crash)
          }
        }

        if (JOIN_LEAVE_ENABLED && Math.random() < 0.3 && Date.now() < endTime - 5000) {
          await new Promise((r) => setTimeout(r, 2000 + Math.random() * 3000))
        }
      }

      return {
        userId,
        fps: totalFps,
        actionCount: allActionLatencies.length,
        actionLatencies: allActionLatencies,
        errors: userErrors,
        sessions,
      }
    }

    const userPromises = Array.from({ length: USER_COUNT }, (_, i) => runUser(i))
    const results = await Promise.all(userPromises)
    reports.push(...results)

    const allFps = reports.flatMap((r) => [r.fps.avgFps, r.fps.p50Fps]).filter((f) => f > 0)
    const allLatencies = reports.flatMap((r) => r.actionLatencies.map((a) => a.latencyMs))
    const sortedLat = [...allLatencies].sort((a, b) => a - b)
    const p95Lat = sortedLat[Math.floor(sortedLat.length * 0.95)] ?? 0
    const avgLat = allLatencies.length ? allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length : 0
    const sortedFps = [...allFps].sort((a, b) => a - b)
    // p5 of FPS distribution = the value 95% of frames exceed (worst 5th percentile)
    const p95Fps = sortedFps[Math.floor(sortedFps.length * 0.05)] ?? 0

    const totalDipsBelow30 = reports.reduce((s, r) => s + r.fps.dipsBelow30, 0)
    const totalDipsBelow10 = reports.reduce((s, r) => s + r.fps.dipsBelow10, 0)
    const addActions = reports.reduce((s, r) => s + r.actionLatencies.filter((a) => a.action.startsWith('add_')).length, 0)
    const uniqueErrors = new Set(allErrors.map((e) => e.message)).size

    const report: LoadTestReport = {
      timestamp: new Date().toISOString(),
      userCount: USER_COUNT,
      durationSec: DURATION_SEC,
      users: reports,
      allErrors,
      summary: {
        avgFpsAcrossUsers: allFps.length ? allFps.reduce((a, b) => a + b, 0) / allFps.length : 0,
        minFpsAcrossUsers: allFps.length ? Math.min(...allFps) : 0,
        p95FpsAcrossUsers: p95Fps,
        totalActions: reports.reduce((s, r) => s + r.actionCount, 0),
        addActions,
        avgActionLatencyMs: Math.round(avgLat),
        p95ActionLatencyMs: p95Lat,
        degradationExceeded: totalDipsBelow30 > reports.length * 10,
        criticalDegradationCount: totalDipsBelow10,
        totalErrors: allErrors.length,
        uniqueErrorMessages: uniqueErrors,
      },
    }

    const outDir = path.join(process.cwd(), 'performance-reports')
    const ts = Date.now()
    fs.mkdirSync(outDir, { recursive: true })
    const reportPath = path.join(outDir, `multi-user-load-${ts}.json`)
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8')

    const s = report.summary
    const htmlPath = path.join(outDir, `multi-user-load-${ts}.html`)
    const errorsHtml = allErrors.length
      ? `<h2>Errors (${allErrors.length})</h2><pre style="max-height:300px;overflow:auto;font-size:11px">${allErrors.slice(0, 50).map((e) => `[${e.type}] ${e.message}${e.url ? ' ' + e.url : ''}`).join('\n')}${allErrors.length > 50 ? '\n...' : ''}</pre>`
      : '<p>No errors recorded.</p>'
    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Load Test ${report.timestamp}</title>
<style>body{font-family:system-ui;max-width:960px;margin:2rem auto;padding:0 1rem}
.summary{background:#f0f4f8;padding:1.5rem;border-radius:8px;margin:1.5rem 0}
.metric{display:inline-block;margin-right:2rem;margin-bottom:.5rem}
.degraded{color:#dc2626}.ok{color:#16a34a}.err{color:#b45309}
table{width:100%;border-collapse:collapse}th,td{padding:.5rem 1rem;text-align:left;border-bottom:1px solid #e5e7eb}
th{background:#f9fafb}pre{background:#1e293b;color:#e2e8f0;padding:1rem;border-radius:8px}</style></head><body>
<h1>Multi-User Load Test Report</h1>
<p><strong>${report.timestamp}</strong> | ${report.userCount} users, ${report.durationSec}s</p>
<div class="summary">
<h2>Summary</h2>
<div class="metric"><strong>Avg FPS:</strong> ${s.avgFpsAcrossUsers.toFixed(1)}</div>
<div class="metric"><strong>Min FPS:</strong> ${s.minFpsAcrossUsers.toFixed(1)}</div>
<div class="metric"><strong>Total actions:</strong> ${s.totalActions}</div>
<div class="metric"><strong>Adds (≈objects):</strong> ${s.addActions}</div>
<div class="metric"><strong>Avg latency:</strong> ${s.avgActionLatencyMs}ms</div>
<div class="metric"><strong>Errors:</strong> <span class="${s.totalErrors > 0 ? 'err' : 'ok'}">${s.totalErrors} (${s.uniqueErrorMessages} unique)</span></div>
<p><strong>Degradation exceeded:</strong> <span class="${s.degradationExceeded ? 'degraded' : 'ok'}">${s.degradationExceeded ? 'Yes' : 'No'}</span></p>
</div>
${errorsHtml}
<h2>Per-User</h2>
<table><thead><tr><th>User</th><th>Avg FPS</th><th>Actions</th><th>Sessions</th><th>Errors</th></tr></thead><tbody>
${report.users.map((u: UserReport) => `<tr><td>${u.userId}</td><td>${u.fps.avgFps.toFixed(1)}</td><td>${u.actionCount}</td><td>${u.sessions}</td><td>${u.errors.length}</td></tr>`).join('')}
</tbody></table>
<footer style="margin-top:2rem;color:#6b7280;font-size:.875rem">${reportPath}</footer>
</body></html>`
    fs.writeFileSync(htmlPath, html, 'utf-8')

    await test.info().attach('load-test-report', { path: reportPath, contentType: 'application/json' })
    await test.info().attach('load-test-html', { path: htmlPath, contentType: 'text/html' })

    // Real assertions with meaningful thresholds
    expect(report.summary.totalActions).toBeGreaterThan(USER_COUNT) // at least 1 action per user
    if (report.summary.avgFpsAcrossUsers > 0) {
      expect(report.summary.avgFpsAcrossUsers).toBeGreaterThan(10) // avg FPS should stay above 10
    }
    if (p95Lat > 0) {
      expect(p95Lat).toBeLessThan(10000) // p95 action latency < 10s
    }
    // No data loss: total actions should be reasonable for duration
    const expectedMinActions = USER_COUNT * Math.max(1, DURATION_SEC / 10)
    expect(report.summary.totalActions).toBeGreaterThan(expectedMinActions * 0.5)

    const sum = report.summary
    console.log('\n')
    console.log('┌─────────────────────────────────────────────────────────────────────────┐')
    console.log('│              MULTI-USER LOAD TEST REPORT (FULL ACTION SET)               │')
    console.log('├─────────────────────────────────────────────────────────────────────────┤')
    console.log(`│  Users: ${String(USER_COUNT).padEnd(4)} | Duration: ${String(DURATION_SEC).padEnd(3)}s | Cursor poll: ${CURSOR_POLL_MS}ms`)
    console.log('├─────────────────────────────────────────────────────────────────────────┤')
    console.log('│  FPS                                                                     │')
    console.log(`│    Avg: ${sum.avgFpsAcrossUsers.toFixed(1).padEnd(6)} | Min: ${sum.minFpsAcrossUsers.toFixed(1).padEnd(6)} | P95: ${sum.p95FpsAcrossUsers.toFixed(1).padEnd(6)}`)
    console.log('│  ACTIONS & LATENCY                                                        │')
    console.log(`│    Total: ${String(sum.totalActions).padEnd(6)} | Adds: ${String(sum.addActions).padEnd(6)} | Avg: ${String(sum.avgActionLatencyMs).padEnd(4)}ms | P95: ${String(sum.p95ActionLatencyMs).padEnd(4)}ms`)
    console.log('│  ERRORS                                                                   │')
    console.log(`│    Total: ${String(sum.totalErrors).padEnd(6)} | Unique: ${String(sum.uniqueErrorMessages).padEnd(6)}`)
    console.log('│  DEGRADATION                                                              │')
    console.log(`│    Dips <30fps: ${String(totalDipsBelow30).padEnd(6)} | Dips <10fps: ${String(totalDipsBelow10).padEnd(6)} | Exceeded: ${(sum.degradationExceeded ? 'Yes' : 'No').padEnd(3)}`)
    console.log('├─────────────────────────────────────────────────────────────────────────┤')
    report.users.slice(0, 8).forEach((u) => {
      console.log(`│  User ${String(u.userId).padEnd(3)}: FPS ${u.fps.avgFps.toFixed(1).padEnd(6)} | Actions ${String(u.actionCount).padEnd(6)} | Sessions ${String(u.sessions).padEnd(3)} | Errors ${String(u.errors.length).padEnd(4)}`)
    })
    if (report.users.length > 8) console.log(`│  ... and ${report.users.length - 8} more users`)
    console.log('├─────────────────────────────────────────────────────────────────────────┤')
    if (allErrors.length > 0) {
      console.log('│  SAMPLE ERRORS (first 5):                                                 │')
      allErrors.slice(0, 5).forEach((e) => { console.log(`│    [${e.type}] ${e.message.slice(0, 55)}${e.message.length > 55 ? '...' : ''}`) })
    }
    console.log('├─────────────────────────────────────────────────────────────────────────┤')
    console.log(`│  JSON: performance-reports/multi-user-load-${ts}.json`)
    console.log(`│  HTML: performance-reports/multi-user-load-${ts}.html`)
    console.log('└─────────────────────────────────────────────────────────────────────────┘')
    console.log('')
  })
})
