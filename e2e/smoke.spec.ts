import { test, expect } from '@playwright/test'

test.describe('Smoke', () => {
  test('landing page loads and shows Theorem', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /hypotheses become theorems/i })).toBeVisible({ timeout: 10000 })
  })

  test('login page is accessible', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveURL(/\/login/)
  })
})
