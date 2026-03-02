import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
	test('register page should render', async ({ page }) => {
		await page.goto('/auth/register');
		await expect(page.locator('#name')).toBeVisible();
		await expect(page.locator('#email')).toBeVisible();
		await expect(page.locator('#password')).toBeVisible();
		await expect(page.locator('button[type="submit"]')).toBeVisible();
	});

	test('login page should render', async ({ page }) => {
		await page.goto('/auth/login');
		await expect(page.locator('#email')).toBeVisible();
		await expect(page.locator('#password')).toBeVisible();
		await expect(page.locator('button[type="submit"]')).toBeVisible();
	});

	test('login with valid credentials should redirect to /projects', async ({ page }) => {
		// Register first
		const email = `e2e-auth-${Date.now()}@test.com`;
		await page.goto('/auth/register');
		await page.fill('#name', 'Auth Test User');
		await page.fill('#email', email);
		await page.fill('#password', 'TestPassword123!');
		await page.fill('#passwordConfirm', 'TestPassword123!');
		await page.click('button[type="submit"]');
		await page.waitForURL('**/projects', { timeout: 15000 });

		// Logout by clearing cookies, then login
		await page.context().clearCookies();
		await page.goto('/auth/login');
		await page.fill('#email', email);
		await page.fill('#password', 'TestPassword123!');
		await page.click('button[type="submit"]');

		await page.waitForURL('**/projects', { timeout: 15000 });
		await expect(page).toHaveURL(/\/projects/);
	});
});
