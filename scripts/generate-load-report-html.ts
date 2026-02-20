/**
 * Generate an HTML report from a multi-user load test JSON file.
 * Usage: npx tsx scripts/generate-load-report-html.ts playwright-report/multi-user-load-*.json
 */
import * as fs from 'fs'
import * as path from 'path'

const reportPath = process.argv[2]
if (!reportPath || !fs.existsSync(reportPath)) {
  console.error('Usage: npx tsx scripts/generate-load-report-html.ts <path-to-json-report>')
  process.exit(1)
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'))
const s = report.summary

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Multi-User Load Test Report - ${report.timestamp}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; }
    h1 { color: #1a1a2e; }
    .summary { background: #f0f4f8; padding: 1.5rem; border-radius: 8px; margin: 1.5rem 0; }
    .summary h2 { margin-top: 0; }
    .metric { display: inline-block; margin-right: 2rem; margin-bottom: 0.5rem; }
    .metric strong { color: #2563eb; }
    .degraded { color: #dc2626; }
    .ok { color: #16a34a; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
    th, td { padding: 0.5rem 1rem; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #f9fafb; }
    footer { margin-top: 2rem; color: #6b7280; font-size: 0.875rem; }
  </style>
</head>
<body>
  <h1>Multi-User Load Test Report</h1>
  <p><strong>Timestamp:</strong> ${report.timestamp}</p>
  <p><strong>Configuration:</strong> ${report.userCount} users, ${report.durationSec}s duration</p>

  <div class="summary">
    <h2>Summary</h2>
    <div class="metric"><strong>Avg FPS:</strong> ${s.avgFpsAcrossUsers.toFixed(1)}</div>
    <div class="metric"><strong>Min FPS:</strong> ${s.minFpsAcrossUsers.toFixed(1)}</div>
    <div class="metric"><strong>P95 FPS:</strong> ${s.p95FpsAcrossUsers.toFixed(1)}</div>
    <div class="metric"><strong>Total actions:</strong> ${s.totalActions}</div>
    <div class="metric"><strong>Avg action latency:</strong> ${s.avgActionLatencyMs}ms</div>
    <div class="metric"><strong>P95 action latency:</strong> ${s.p95ActionLatencyMs}ms</div>
    <div class="metric"><strong>Critical dips (&lt;10fps):</strong> ${s.criticalDegradationCount}</div>
    <p>
      <strong>Degradation exceeded:</strong>
      <span class="${s.degradationExceeded ? 'degraded' : 'ok'}">${s.degradationExceeded ? 'Yes' : 'No'}</span>
    </p>
    <p><em>Cursor throttle range: 16ms (60Hz) - 150ms (~7Hz at 32 users)</em></p>
  </div>

  <h2>Per-User Metrics</h2>
  <table>
    <thead>
      <tr>
        <th>User</th>
        <th>Avg FPS</th>
        <th>Min FPS</th>
        <th>P95 FPS</th>
        <th>Dips &lt;30fps</th>
        <th>Dips &lt;10fps</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      ${report.users.map((u: { userId: number; fps: { avgFps: number; minFps: number; p95Fps: number; dipsBelow30: number; dipsBelow10: number }; actionCount: number }) =>
        `<tr>
          <td>${u.userId}</td>
          <td>${u.fps.avgFps.toFixed(1)}</td>
          <td>${u.fps.minFps.toFixed(1)}</td>
          <td>${u.fps.p95Fps.toFixed(1)}</td>
          <td>${u.fps.dipsBelow30}</td>
          <td>${u.fps.dipsBelow10}</td>
          <td>${u.actionCount}</td>
        </tr>`
      ).join('')}
    </tbody>
  </table>

  <footer>
    Generated from ${path.basename(reportPath)}. Run with: MULTI_USER_COUNT=30 MULTI_USER_DURATION_SEC=60 npm run test:e2e -- e2e/multi-user-load.spec.ts
  </footer>
</body>
</html>
`

const outPath = reportPath.replace(/\.json$/, '.html')
fs.writeFileSync(outPath, html, 'utf-8')
console.log('Wrote', outPath)
