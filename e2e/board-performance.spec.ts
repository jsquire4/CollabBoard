import { test, expect } from '@playwright/test'

/**
 * Board performance stress tests.
 *
 * Requires E2E_TEST_BOARD_ID env var (UUID of a board owned by the test account)
 * and E2E_TEST_EMAIL (used by global-setup to authenticate).
 *
 * Run via: npm run test:e2e:stress
 */
const BOARD_ID = process.env.E2E_TEST_BOARD_ID

/** Wait for board to fully load */
async function waitForBoard(page: import('@playwright/test').Page) {
  await Promise.race([
    page.locator('canvas').first().waitFor({ state: 'visible', timeout: 15000 }),
    page.getByRole('button', { name: /share|logout/i }).waitFor({ state: 'visible', timeout: 15000 }),
  ])
}

/** Get the real board object count from the app's exposed counter */
async function getBoardObjectCount(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => (window as unknown as Record<string, number>).__boardObjectCount ?? 0)
}

/** Start FPS measurement via requestAnimationFrame */
const START_FPS = `
  window.__fpsFrameTimes = [];
  window.__fpsStartTime = performance.now();
  let __last = performance.now();
  const __measure = (now) => {
    window.__fpsFrameTimes.push(now - __last);
    __last = now;
    requestAnimationFrame(__measure);
  };
  requestAnimationFrame(__measure);
`

/** Collect FPS metrics */
const GET_FPS = `
  (() => {
    const frameTimes = (window.__fpsFrameTimes || []).filter(t => t > 0 && t < 1000);
    if (frameTimes.length === 0) return { avgFps: 0, minFps: 0, p5Fps: 0 };
    const sorted = [...frameTimes].sort((a,b) => a - b);
    const toFps = (ms) => ms > 0 ? 1000 / ms : 0;
    const fps = frameTimes.map(toFps);
    const avgFps = fps.reduce((a,b) => a+b, 0) / fps.length;
    const minFps = Math.min(...fps);
    const p5Idx = Math.floor(sorted.length * 0.95);
    const p5Fps = toFps(sorted[p5Idx] ?? sorted[sorted.length - 1]);
    return { avgFps: Math.round(avgFps), minFps: Math.round(minFps), p5Fps: Math.round(p5Fps), samples: frameTimes.length };
  })()
`

test.describe('Board performance', () => {
  test.skip(!BOARD_ID || !process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_BOARD_ID and E2E_TEST_EMAIL to run board performance tests')

  test('board load: navigation timing within budget', async ({ page }) => {
    await page.goto(`/board/${BOARD_ID}`)
    await waitForBoard(page)

    const navTiming = await page.evaluate(() => {
      const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
      const nav = entries[0]
      if (!nav) return null
      return {
        domComplete: Math.round(nav.domComplete),
        domInteractive: Math.round(nav.domInteractive),
        duration: Math.round(nav.duration),
      }
    })

    expect(navTiming).not.toBeNull()
    if (navTiming) {
      expect(navTiming.domComplete).toBeLessThan(5000)
      expect(navTiming.duration).toBeLessThan(6000)
      await test.info().attach('navigation-timing', {
        body: JSON.stringify(navTiming, null, 2),
        contentType: 'application/json',
      })
    }

    const paintTiming = await page.evaluate(() => {
      const entries = performance.getEntriesByType('paint')
      const fcp = entries.find(e => e.name === 'first-contentful-paint')
      return { firstContentfulPaint: fcp ? Math.round(fcp.startTime) : null }
    })

    if (paintTiming.firstContentfulPaint != null) {
      expect(paintTiming.firstContentfulPaint).toBeLessThan(2500)
    }
  })

  test('rapid shape addition: 50 shapes via toolbar, measure degradation', async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto(`/board/${BOARD_ID}`)
    await waitForBoard(page)

    const canvas = page.locator('canvas').first()
    const initialCount = await getBoardObjectCount(page)

    // Start FPS monitoring
    await page.evaluate(START_FPS)

    const addTimes: number[] = []

    for (let i = 0; i < 50; i++) {
      // Click the Shapes group to open flyout
      const shapesBtn = page.getByRole('button', { name: /Shapes/i }).first()
      if (await shapesBtn.isVisible().catch(() => false)) {
        await shapesBtn.click().catch(() => {})
        await page.waitForTimeout(50)
      }
      const rectBtn = page.getByRole('button', { name: /Rectangle/i }).first()
      if (await rectBtn.isVisible().catch(() => false)) {
        await rectBtn.click().catch(() => {})
      }

      const beforeCount = await getBoardObjectCount(page)
      const start = Date.now()
      const cx = 100 + (i % 10) * 70
      const cy = 100 + Math.floor(i / 10) * 70
      await canvas.click({ position: { x: cx, y: cy }, force: true, timeout: 3000 })

      // Wait for object count to increase (with timeout)
      const deadline = Date.now() + 2000
      while (Date.now() < deadline) {
        const current = await getBoardObjectCount(page)
        if (current > beforeCount) break
        await page.waitForTimeout(50)
      }

      addTimes.push(Date.now() - start)
    }

    const finalCount = await getBoardObjectCount(page)
    const fps = await page.evaluate(GET_FPS) as { avgFps: number; minFps: number; p5Fps: number; samples: number }

    // Calculate stats
    const avgAddTime = Math.round(addTimes.reduce((a, b) => a + b, 0) / addTimes.length)
    const maxAddTime = Math.max(...addTimes)
    const shapesAdded = finalCount - initialCount

    await test.info().attach('rapid-add-metrics', {
      body: JSON.stringify({
        shapesAdded,
        avgAddTimeMs: avgAddTime,
        maxAddTimeMs: maxAddTime,
        avgFps: fps.avgFps,
        minFps: fps.minFps,
        p5Fps: fps.p5Fps,
        fpsSamples: fps.samples,
      }, null, 2),
      contentType: 'application/json',
    })

    // Assertions: real thresholds
    expect(avgAddTime).toBeLessThan(2000)
    expect(shapesAdded).toBeGreaterThanOrEqual(20) // at least some shapes were added
    if (fps.samples > 10) {
      expect(fps.avgFps).toBeGreaterThan(15) // should stay above 15 FPS average
    }

    // Print summary
    console.log('')
    console.log('┌─────────────────────────┬──────────────┬──────────┐')
    console.log('│ Metric                  │ Value        │ Status   │')
    console.log('├─────────────────────────┼──────────────┼──────────┤')
    console.log(`│ Shapes added            │ ${String(shapesAdded).padEnd(12)} │ ${shapesAdded >= 20 ? '✓ PASS  ' : '✗ FAIL  '} │`)
    console.log(`│ Avg add time            │ ${String(avgAddTime + 'ms').padEnd(12)} │ ${avgAddTime < 2000 ? '✓ PASS  ' : '✗ FAIL  '} │`)
    console.log(`│ Max add time            │ ${String(maxAddTime + 'ms').padEnd(12)} │ ${maxAddTime < 5000 ? '✓ PASS  ' : '✗ FAIL  '} │`)
    console.log(`│ Avg FPS                 │ ${String(fps.avgFps).padEnd(12)} │ ${fps.avgFps > 15 ? '✓ PASS  ' : '✗ FAIL  '} │`)
    console.log(`│ Min FPS                 │ ${String(fps.minFps).padEnd(12)} │ ${fps.minFps > 5 ? '✓ PASS  ' : '✗ FAIL  '} │`)
    console.log('└─────────────────────────┴──────────────┴──────────┘')
    console.log('')
  })

  test('interaction responsiveness: canvas click latency', async ({ page }) => {
    await page.goto(`/board/${BOARD_ID}`)
    await waitForBoard(page)

    const canvas = page.locator('canvas').first()
    const latencies: number[] = []

    for (let i = 0; i < 10; i++) {
      const start = Date.now()
      await canvas.click({
        position: { x: 200 + i * 30, y: 200 + i * 20 },
        force: true,
      })
      // Wait for any resulting state update
      await page.waitForTimeout(50)
      latencies.push(Date.now() - start)
    }

    const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    const maxLatency = Math.max(...latencies)

    expect(avgLatency).toBeLessThan(500)
    expect(maxLatency).toBeLessThan(1000)

    await test.info().attach('click-latencies', {
      body: JSON.stringify({ avgMs: avgLatency, maxMs: maxLatency, all: latencies }, null, 2),
      contentType: 'application/json',
    })
  })

  test('board with shapes: object count reflects real state', async ({ page }) => {
    await page.goto(`/board/${BOARD_ID}`)
    await waitForBoard(page)

    // Use the real object count from the app
    const objectCount = await getBoardObjectCount(page)

    const loadMetrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      return {
        domComplete: nav ? Math.round(nav.domComplete) : null,
        loadEventEnd: nav ? Math.round(nav.loadEventEnd) : null,
      }
    })

    await test.info().attach('board-state-metrics', {
      body: JSON.stringify({
        boardObjectCount: objectCount,
        ...loadMetrics,
      }, null, 2),
      contentType: 'application/json',
    })

    // Verify instrumentation works — window.__boardObjectCount should be set
    // (even an empty board has count 0 which is valid, but undefined means instrumentation failed)
    const hasInstrumentation = await page.evaluate(() => '__boardObjectCount' in window)
    expect(hasInstrumentation).toBe(true)
    if (loadMetrics.domComplete != null) {
      expect(loadMetrics.domComplete).toBeLessThan(8000)
    }
  })
})
