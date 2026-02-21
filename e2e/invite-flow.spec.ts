import { test, expect } from '@playwright/test'

/**
 * Invite flow E2E tests.
 *
 * Requires E2E_TEST_EMAIL + E2E_TEST_PASSWORD (authenticated via global-setup).
 * Tests the share dialog invite submission, unauthenticated redirect,
 * authenticated accept, and invalid token handling.
 *
 * Run via: npm run test:e2e:functional
 */

test.describe('Invite flow', () => {
  test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run invite flow tests')

  /** Helper: create a board from the dashboard and return its URL */
  async function createBoard(page: import('@playwright/test').Page, name: string): Promise<string> {
    await page.goto('/boards')
    await page.waitForURL('**/boards', { timeout: 10000 })

    const createBtn = page.getByRole('button', { name: /create|new board/i }).first()
    await createBtn.click()

    const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]').first()
    if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nameInput.fill(name)
      const confirmBtn = page.getByRole('button', { name: /create|save|ok/i }).first()
      await confirmBtn.click()
    }

    await page.waitForURL(/\/board\//, { timeout: 10000 })
    return page.url()
  }

  test('owner opens share dialog and sends invite — success status appears', async ({ page }) => {
    // Create a test board
    await createBoard(page, `Invite Test ${Date.now()}`)

    // Open share dialog
    const shareBtn = page.getByRole('button', { name: /share/i }).first()
    await shareBtn.waitFor({ state: 'visible', timeout: 10000 })
    await shareBtn.click()

    // Find the invite email input
    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]').first()
    await emailInput.waitFor({ state: 'visible', timeout: 5000 })
    await emailInput.fill('e2e-invite-test@example.com')

    // Submit the invite
    const inviteBtn = page.getByRole('button', { name: /invite|send/i }).first()
    await inviteBtn.click()

    // Verify success status appears
    await expect(
      page.getByText(/invited|added/i).first()
    ).toBeVisible({ timeout: 10000 })

    // Verify no error toast (count check — works whether or not the element exists)
    const errorToasts = page.locator('[data-sonner-toast][data-type="error"]')
    await expect(errorToasts).toHaveCount(0, { timeout: 2000 })
  })

  test('unauthenticated visit to /invite/accept redirects to login with returnTo', async ({ browser }) => {
    // Create a new context without authentication
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto('/invite/accept?id=00000000-0000-0000-0000-000000000000')

    // Should redirect to login
    await page.waitForURL(/\/login/, { timeout: 10000 })
    const url = new URL(page.url())
    expect(url.pathname).toBe('/login')

    // returnTo should contain the invite accept URL
    const returnTo = url.searchParams.get('returnTo')
    expect(returnTo).toContain('/invite/accept')
    expect(returnTo).toContain('00000000-0000-0000-0000-000000000000')

    await context.close()
  })

  test('invite accept with invalid token redirects to /boards with error', async ({ page }) => {
    // Visit with a UUID that doesn't exist in the database
    await page.goto('/invite/accept?id=99999999-9999-9999-9999-999999999999')

    // Should redirect to /boards with error param
    await page.waitForURL(/\/boards/, { timeout: 10000 })
    const url = new URL(page.url())
    expect(url.searchParams.get('error')).toBe('invite-invalid')
  })

  test('invite accept with non-UUID token redirects to /boards with error', async ({ page }) => {
    await page.goto('/invite/accept?id=not-a-valid-uuid')

    await page.waitForURL(/\/boards/, { timeout: 10000 })
    const url = new URL(page.url())
    expect(url.searchParams.get('error')).toBe('invite-invalid')
  })
})
