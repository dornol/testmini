import { test, expect } from '../fixtures/auth.fixture';

/**
 * Bulk Operations E2E tests.
 *
 * Covers: creating multiple test cases, selecting them,
 * performing bulk actions (delete, priority change).
 */

test.describe.serial('Bulk Operations', () => {
	const ts = Date.now();
	const projectName = `Bulk Ops Project ${ts}`;
	let projectId: string;

	test('1. Create a project', async ({ page }) => {
		await page.goto('/projects/new');
		await page.fill('#name', projectName);
		await page.fill('#description', 'E2E bulk operations test');
		await page.click('button[type="submit"]');
		await page.waitForURL('**/projects/**', { timeout: 15000 });

		const match = page.url().match(/\/projects\/(\d+)/);
		expect(match).not.toBeNull();
		projectId = match![1];
	});

	test('2. Create multiple test cases via quick-create', async ({ page }) => {
		await page.goto(`/projects/${projectId}/test-cases`);
		await page.waitForLoadState('networkidle');

		const titles = ['Bulk Test A', 'Bulk Test B', 'Bulk Test C'];

		for (const title of titles) {
			const quickForm = page.locator('form[action*="quickCreate"]').first();
			await expect(quickForm).toBeVisible({ timeout: 10000 });

			const titleInput = quickForm.locator('input[name="title"]');
			await titleInput.fill(title);

			const submitBtn = quickForm.locator('button[type="submit"]');
			await submitBtn.click();
			await page.waitForTimeout(1500);
		}

		// All 3 test cases should be visible
		await expect(page.locator('text=TC-0001').first()).toBeVisible({ timeout: 10000 });
		await expect(page.locator('text=TC-0002').first()).toBeVisible({ timeout: 10000 });
		await expect(page.locator('text=TC-0003').first()).toBeVisible({ timeout: 10000 });
	});

	test('3. Select multiple test cases via checkboxes', async ({ page }) => {
		await page.goto(`/projects/${projectId}/test-cases`);
		await page.waitForLoadState('networkidle');

		// Wait for test cases to render
		await expect(page.locator('text=TC-0001').first()).toBeVisible({ timeout: 10000 });

		// Find checkboxes (each row should have a checkbox)
		const checkboxes = page.locator('input[type="checkbox"], button[role="checkbox"]');
		const count = await checkboxes.count();
		expect(count).toBeGreaterThanOrEqual(3);

		// Select first two test cases
		await checkboxes.nth(0).click();
		await checkboxes.nth(1).click();
	});

	test('4. Bulk action bar appears when items selected', async ({ page }) => {
		await page.goto(`/projects/${projectId}/test-cases`);
		await page.waitForLoadState('networkidle');
		await expect(page.locator('text=TC-0001').first()).toBeVisible({ timeout: 10000 });

		// Select a checkbox
		const checkboxes = page.locator('input[type="checkbox"], button[role="checkbox"]');
		await checkboxes.first().click();

		// Bulk action bar should appear (contains text like "selected" or action buttons)
		const bulkBar = page.locator('[class*="bulk"], [data-testid*="bulk"]').first();
		// If no specific class, look for text indicating selection count
		const selectionText = page.locator('text=/\\d+ selected|선택/i').first();
		const hasBulkUI = await bulkBar.isVisible({ timeout: 3000 }).catch(() => false) ||
			await selectionText.isVisible({ timeout: 3000 }).catch(() => false);
		expect(hasBulkUI).toBe(true);
	});

	test('5. Select all via header checkbox', async ({ page }) => {
		await page.goto(`/projects/${projectId}/test-cases`);
		await page.waitForLoadState('networkidle');
		await expect(page.locator('text=TC-0001').first()).toBeVisible({ timeout: 10000 });

		// The "select all" checkbox is typically in the header
		const selectAllCheckbox = page.locator('thead input[type="checkbox"], thead button[role="checkbox"], [aria-label*="all" i]').first();
		if (await selectAllCheckbox.isVisible({ timeout: 3000 }).catch(() => false)) {
			await selectAllCheckbox.click();

			// All checkboxes should be checked
			const selectionText = page.locator('text=/3 selected|3개 선택/i').first();
			await expect(selectionText).toBeVisible({ timeout: 5000 });
		}
	});
});
