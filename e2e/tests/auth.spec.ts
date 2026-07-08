import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@admin.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin1234';

test.describe('Authentication', () => {
	test('register page should not be available', async ({ page }) => {
		const response = await page.goto('/auth/register');
		expect(response?.status()).toBe(404);
	});

	test('login page should render', async ({ page }) => {
		await page.goto('/auth/login');
		await expect(page.locator('#email')).toBeVisible();
		await expect(page.locator('#password')).toBeVisible();
		await expect(page.locator('button[type="submit"]')).toBeVisible();
	});

	test('login with valid credentials should redirect to /projects', async ({ page }) => {
		await page.context().clearCookies();
		await page.goto('/auth/login');
		await page.fill('#email', ADMIN_EMAIL);
		await page.fill('#password', ADMIN_PASSWORD);
		await page.click('button[type="submit"]');

		await page.waitForURL('**/projects', { timeout: 15000 });
		await expect(page).toHaveURL(/\/projects/);
	});
});
