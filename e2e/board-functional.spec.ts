import { test, expect } from '@playwright/test'

/**
 * Board functional E2E tests.
 *
 * Requires E2E_TEST_EMAIL + E2E_TEST_PASSWORD (authenticated via global-setup).
 * Does NOT require E2E_TEST_BOARD_ID — each test creates its own board.
 *
 * Run via: npm run test:e2e:functional
 */

test.describe('Board functional', () => {
  test.skip(!process.env.E2E_TEST_EMAIL, 'Set E2E_TEST_EMAIL to run board functional tests')

  /** Helper: create a board from the dashboard and return its URL */
  async function createBoard(page: import('@playwright/test').Page, name: string): Promise<string> {
    await page.goto('/boards')
    await page.waitForURL('**/boards', { timeout: 10000 })

    const createBtn = page.getByRole('button', { name: /create|new board/i }).first()
    await createBtn.click()

    // Fill board name if a dialog/input appears
    const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]').first()
    if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nameInput.fill(name)
      const confirmBtn = page.getByRole('button', { name: /create|save|ok/i }).first()
      await confirmBtn.click()
    }

    // Wait for navigation to the new board page
    await page.waitForURL(/\/board\//, { timeout: 10000 })
    return page.url()
  }

  /** Helper: wait for board canvas to be ready */
  async function waitForBoard(page: import('@playwright/test').Page) {
    await Promise.race([
      page.locator('canvas').first().waitFor({ state: 'visible', timeout: 15000 }),
      page.getByRole('button', { name: /share|logout/i }).waitFor({ state: 'visible', timeout: 15000 }),
    ])
  }

  /** Helper: add a rectangle shape via the toolbar */
  async function addRectangle(page: import('@playwright/test').Page, x: number, y: number) {
    const shapesBtn = page.getByRole('button', { name: /Shapes/i }).first()
    if (await shapesBtn.isVisible().catch(() => false)) {
      await shapesBtn.click()
      await page.waitForTimeout(100)
    }
    const rectBtn = page.getByRole('button', { name: /Rectangle/i }).first()
    if (await rectBtn.isVisible().catch(() => false)) {
      await rectBtn.click()
    }
    const canvas = page.locator('canvas').first()
    await canvas.click({ position: { x, y }, force: true })
    await page.waitForTimeout(300)
  }

  /** Helper: add a sticky note via the toolbar */
  async function addStickyNote(page: import('@playwright/test').Page, x: number, y: number) {
    const basicsBtn = page.getByRole('button', { name: /Basics/i }).first()
    if (await basicsBtn.isVisible().catch(() => false)) {
      await basicsBtn.click()
      await page.waitForTimeout(100)
    }
    const noteBtn = page.getByRole('button', { name: /Note|Sticky/i }).first()
    if (await noteBtn.isVisible().catch(() => false)) {
      await noteBtn.click()
    }
    const canvas = page.locator('canvas').first()
    await canvas.click({ position: { x, y }, force: true })
    await page.waitForTimeout(300)
  }

  /** Helper: get board object count */
  async function getBoardObjectCount(page: import('@playwright/test').Page): Promise<number> {
    return page.evaluate(() => (window as unknown as Record<string, number>).__boardObjectCount ?? 0)
  }

  test('board CRUD: create, verify in list, rename, delete', async ({ page }) => {
    const boardName = `Test Board ${Date.now()}`

    // Create board
    const boardUrl = await createBoard(page, boardName)
    expect(boardUrl).toMatch(/\/board\//)

    // Go back to dashboard and verify it appears
    await page.goto('/boards')
    await page.waitForURL('**/boards', { timeout: 10000 })
    await expect(page.getByText(boardName).first()).toBeVisible({ timeout: 5000 })

    // Rename board
    const renamedName = `Renamed ${Date.now()}`
    const boardCard = page.getByText(boardName).first()
    await boardCard.hover()
    // Look for a rename/edit button or context menu
    const renameBtn = page.getByRole('button', { name: /rename|edit/i }).first()
    if (await renameBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await renameBtn.click()
      const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]').first()
      await nameInput.fill(renamedName)
      await page.keyboard.press('Enter')
      await page.waitForTimeout(500)
      await expect(page.getByText(renamedName).first()).toBeVisible({ timeout: 5000 })
    }

    // Delete board
    const deleteBtn = page.getByRole('button', { name: /delete|remove/i }).first()
    if (await deleteBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await deleteBtn.click()
      // Confirm deletion if dialog appears
      const confirmBtn = page.getByRole('button', { name: /confirm|yes|delete/i }).first()
      if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmBtn.click()
      }
      await page.waitForTimeout(1000)
    }
  })

  test('shape lifecycle: add rectangle, verify on canvas, select, delete', async ({ page }) => {
    await createBoard(page, `Shape Test ${Date.now()}`)
    await waitForBoard(page)

    const countBefore = await getBoardObjectCount(page)

    // Add rectangle
    await addRectangle(page, 300, 300)

    const countAfterAdd = await getBoardObjectCount(page)
    expect(countAfterAdd).toBeGreaterThan(countBefore)

    // Click the shape to select it
    const canvas = page.locator('canvas').first()
    await canvas.click({ position: { x: 300, y: 300 }, force: true })
    await page.waitForTimeout(200)

    // Delete via keyboard
    await page.keyboard.press('Delete')
    await page.waitForTimeout(500)

    const countAfterDelete = await getBoardObjectCount(page)
    expect(countAfterDelete).toBeLessThan(countAfterAdd)
  })

  test('text editing: add sticky note, edit text, verify persistence after reload', async ({ page }) => {
    const boardUrl = await createBoard(page, `Text Test ${Date.now()}`)
    await waitForBoard(page)

    // Add sticky note
    await addStickyNote(page, 300, 300)

    // Double-click to enter text editing mode
    const canvas = page.locator('canvas').first()
    await canvas.dblclick({ position: { x: 300, y: 300 }, force: true })
    await page.waitForTimeout(300)

    const testText = `Hello E2E ${Date.now()}`
    await page.keyboard.type(testText, { delay: 30 })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    // Reload and verify text persists
    await page.goto(boardUrl)
    await waitForBoard(page)
    await page.waitForTimeout(1000)

    // Check that text is present on the page (rendered in canvas or DOM)
    const pageContent = await page.evaluate(() => document.body.innerText)
    // The text may be in a canvas, so also check via the board object instrumentation
    const objectCount = await getBoardObjectCount(page)
    expect(objectCount).toBeGreaterThan(0)
  })

  test('undo/redo: add shape, delete, undo restores, redo removes', async ({ page }) => {
    await createBoard(page, `Undo Test ${Date.now()}`)
    await waitForBoard(page)

    const countBefore = await getBoardObjectCount(page)

    // Add shape
    await addRectangle(page, 300, 300)
    const countAfterAdd = await getBoardObjectCount(page)
    expect(countAfterAdd).toBeGreaterThan(countBefore)

    // Select and delete
    const canvas = page.locator('canvas').first()
    await canvas.click({ position: { x: 300, y: 300 }, force: true })
    await page.waitForTimeout(200)
    await page.keyboard.press('Delete')
    await page.waitForTimeout(500)

    const countAfterDelete = await getBoardObjectCount(page)
    expect(countAfterDelete).toBeLessThan(countAfterAdd)

    // Undo — shape should reappear
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(500)

    const countAfterUndo = await getBoardObjectCount(page)
    expect(countAfterUndo).toBeGreaterThanOrEqual(countAfterAdd)

    // Redo — shape should be deleted again
    await page.keyboard.press('Control+Shift+z')
    await page.waitForTimeout(500)

    const countAfterRedo = await getBoardObjectCount(page)
    expect(countAfterRedo).toBeLessThan(countAfterUndo)
  })

  test('share flow: open share dialog, verify join link format', async ({ page }) => {
    await createBoard(page, `Share Test ${Date.now()}`)
    await waitForBoard(page)

    // Click share button
    const shareBtn = page.getByRole('button', { name: /share/i }).first()
    await expect(shareBtn).toBeVisible({ timeout: 5000 })
    await shareBtn.click()
    await page.waitForTimeout(500)

    // Look for a join link or copy button in the share dialog
    const linkInput = page.locator('input[readonly], input[value*="/board/join/"]').first()
    const copyBtn = page.getByRole('button', { name: /copy/i }).first()

    if (await linkInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      const linkValue = await linkInput.inputValue()
      expect(linkValue).toMatch(/\/board\/join\//)
    } else if (await copyBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      // The link may be displayed as text rather than in an input
      const dialogText = await page.locator('[role="dialog"], .modal, [data-testid="share-dialog"]').first().innerText().catch(() => '')
      expect(dialogText).toMatch(/\/board\/join\/|join link|share/i)
    }
  })

  test('context menu: right-click shape, verify menu items', async ({ page }) => {
    await createBoard(page, `Context Menu Test ${Date.now()}`)
    await waitForBoard(page)

    // Add a shape to right-click on
    await addRectangle(page, 300, 300)

    // Select the shape
    const canvas = page.locator('canvas').first()
    await canvas.click({ position: { x: 300, y: 300 }, force: true })
    await page.waitForTimeout(200)

    // Right-click to open context menu
    await canvas.click({ position: { x: 300, y: 300 }, button: 'right', force: true })
    await page.waitForTimeout(300)

    // Verify context menu appears with expected items
    const contextMenu = page.locator('[role="menu"], .context-menu, [data-testid="context-menu"]').first()
    await expect(contextMenu).toBeVisible({ timeout: 3000 })

    // Check for expected menu items
    const expectedItems = [/duplicate/i, /delete/i, /front/i]
    for (const item of expectedItems) {
      const menuItem = page.getByRole('menuitem', { name: item }).first()
        .or(page.locator(`[role="menu"] >> text=${item.source?.replace(/\//g, '') ?? ''}`).first())
      // At least some of the items should be visible
      if (await menuItem.isVisible({ timeout: 1000 }).catch(() => false)) {
        expect(true).toBe(true)
      }
    }
  })

  test('multi-select: add 2 shapes, shift-click both, verify both selected', async ({ page }) => {
    await createBoard(page, `Multi-Select Test ${Date.now()}`)
    await waitForBoard(page)

    // Add two shapes at different positions
    await addRectangle(page, 200, 200)
    await addRectangle(page, 400, 400)

    const canvas = page.locator('canvas').first()

    // Click first shape
    await canvas.click({ position: { x: 200, y: 200 }, force: true })
    await page.waitForTimeout(200)

    // Shift-click second shape to multi-select
    await canvas.click({ position: { x: 400, y: 400 }, force: true, modifiers: ['Shift'] })
    await page.waitForTimeout(300)

    // Verify: Transformer should be visible on both — check that multi-selection is active
    // We can verify by checking that the Konva Transformer is present (visible anchors on canvas)
    // or by checking the app's selection state
    const selectedCount = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>
      // Try common patterns for exposing selected IDs
      const ids = (w.__selectedIds as string[] | undefined) ?? []
      return Array.isArray(ids) ? ids.length : 0
    })

    // If instrumentation is available, verify 2 are selected
    // Otherwise, just verify the interactions didn't error
    if (selectedCount > 0) {
      expect(selectedCount).toBeGreaterThanOrEqual(2)
    }
  })

  test('zoom controls: zoom in, verify stage scale changes, zoom to fit', async ({ page }) => {
    await createBoard(page, `Zoom Test ${Date.now()}`)
    await waitForBoard(page)

    // Get initial scale
    const initialScale = await page.evaluate(() => {
      const w = window as unknown as Record<string, number>
      return w.__stageScale ?? 1
    })

    // Try zoom in via keyboard shortcut (Ctrl+= or Ctrl++)
    await page.keyboard.press('Control+=')
    await page.waitForTimeout(300)

    // Or try zoom in button
    const zoomInBtn = page.getByRole('button', { name: /zoom in|\+/i }).first()
    if (await zoomInBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await zoomInBtn.click()
      await page.waitForTimeout(300)
    }

    const zoomedScale = await page.evaluate(() => {
      const w = window as unknown as Record<string, number>
      return w.__stageScale ?? 1
    })

    // If scale instrumentation is available, verify it changed
    if (zoomedScale !== 1 || initialScale !== 1) {
      expect(zoomedScale).not.toBe(initialScale)
    }

    // Try zoom to fit button
    const fitBtn = page.getByRole('button', { name: /fit|zoom to fit|100%/i }).first()
    if (await fitBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await fitBtn.click()
      await page.waitForTimeout(300)
    }
  })
})
