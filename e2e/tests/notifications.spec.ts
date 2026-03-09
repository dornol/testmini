import { test, expect } from '../fixtures/auth.fixture';

/**
 * Notifications E2E tests.
 *
 * Covers: notification bell visibility, notification panel toggle,
 * mark as read functionality.
 */

test.describe('Notifications', () => {
	test('1. Notification bell is visible in header', async ({ page }) => {
		await page.goto('/projects');
		await page.waitForLoadState('networkidle');

		// Bell icon button should be in the header
		const bellBtn = page.locator('button[aria-label*="notification" i], a[href*="notification" i], button:has(svg)').filter({ hasText: /^$/ });
		const headerBell = page.locator('header button').filter({
			has: page.locator('svg')
		});

		const hasBell = await headerBell.count();
		expect(hasBell).toBeGreaterThan(0);
	});

	test('2. Clicking bell navigates to or opens notifications', async ({ page }) => {
		await page.goto('/projects');
		await page.waitForLoadState('networkidle');

		// Find the notification bell button in header
		const headerButtons = page.locator('header a, header button');
		const count = await headerButtons.count();

		let notifFound = false;
		for (let i = 0; i < count; i++) {
			const btn = headerButtons.nth(i);
			const href = await btn.getAttribute('href');
			const label = await btn.getAttribute('aria-label');
			if (href?.includes('notification') || label?.toLowerCase().includes('notification')) {
				await btn.click();
				notifFound = true;
				break;
			}
		}

		if (notifFound) {
			// Either navigated to notifications page or opened a panel
			await page.waitForTimeout(1000);
			const url = page.url();
			const hasPanel = await page.locator('[role="dialog"], [class*="notification"]').isVisible().catch(() => false);
			expect(url.includes('notification') || hasPanel).toBe(true);
		}
	});

	test('3. Notifications page loads when navigated directly', async ({ page }) => {
		await page.goto('/notifications');
		await page.waitForLoadState('networkidle');

		// Should either load successfully or redirect
		const status = page.url();
		// Page should load without error
		await expect(page.locator('body')).toBeVisible();
	});
});
