import { chromium, type FullConfig } from '@playwright/test'
import { loadEnvConfig } from '@next/env'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Playwright global setup: authenticates via email/password and saves
 * storageState to .auth/user.json for reuse by performance test projects.
 *
 * Requires E2E_TEST_EMAIL + E2E_TEST_PASSWORD env vars.
 * If missing, exits silently — tests skip themselves.
 */
export default async function globalSetup(config: FullConfig) {
  loadEnvConfig(process.cwd())

  const email = process.env.E2E_TEST_EMAIL
  const password = process.env.E2E_TEST_PASSWORD
  if (!email || !password) return

  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:3000'
  const authDir = path.join(process.cwd(), '.auth')
  fs.mkdirSync(authDir, { recursive: true })
  const storagePath = path.join(authDir, 'user.json')

  const browser = await chromium.launch()
  const page = await browser.newPage({ baseURL })

  await page.goto('/login')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL('**/boards', { timeout: 15000 })

  await page.context().storageState({ path: storagePath })
  await browser.close()
}
