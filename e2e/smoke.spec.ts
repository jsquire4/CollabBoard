import { test, expect } from '@playwright/test'

test.describe('Smoke', () => {
  test('landing page loads and shows CollabBoard', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'CollabBoard' })).toBeVisible({ timeout: 10000 })
  })

  test('login page is accessible', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveURL(/\/login/)
  })
})
