import { test, expect } from '@playwright/test';

/**
 * Admin panel E2E tests.
 *
 * The admin panel requires the authenticated user to have role === 'admin'.
 * The global setup logs in with the seeded admin account.
 */

const ADMIN_STORAGE = './e2e/.auth-storage.json';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@admin.local';

// ---------------------------------------------------------------------------
// Helper: create a test that uses the admin storage state
// ---------------------------------------------------------------------------

function adminTest(
	title: string,
	fn: (args: { page: import('@playwright/test').Page }) => Promise<void>
) {
	test(title, async ({ browser }) => {
		const context = await browser.newContext({ storageState: ADMIN_STORAGE });
		const page = await context.newPage();
		try {
			await fn({ page });
		} finally {
			await context.close();
		}
	});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Admin Panel', () => {
	// Increase timeout for setup-heavy tests
	test.setTimeout(60000);

	adminTest('should navigate to admin panel and redirect to users list', async ({ page }) => {
		await page.goto('/admin');
		// /admin redirects to /admin/users
		await page.waitForURL('**/admin/users', { timeout: 10000 });
		await expect(page).toHaveURL(/\/admin\/users/);
	});

	adminTest('should see users list with table headers', async ({ page }) => {
		await page.goto('/admin/users');
		await page.waitForLoadState('networkidle');

		await expect(page.locator('table')).toBeVisible();
		await expect(page.locator('th').first()).toBeVisible();
	});

	adminTest('should display the admin user in the users list', async ({ page }) => {
		await page.goto('/admin/users');
		await page.waitForLoadState('networkidle');

		await expect(page.locator(`text=${ADMIN_EMAIL}`).first()).toBeVisible({ timeout: 10000 });
	});

	adminTest('should search for a user by name', async ({ page }) => {
		await page.goto('/admin/users');
		await page.waitForLoadState('networkidle');

		// Fill the search input and submit
		const searchInput = page.locator('input[placeholder]').first();
		await searchInput.fill(ADMIN_EMAIL);
		await page.locator('button[type="submit"]').first().click();

		await page.waitForLoadState('networkidle');
		await expect(page.locator(`text=${ADMIN_EMAIL}`).first()).toBeVisible({ timeout: 10000 });
	});

	adminTest('should navigate to projects list in admin panel', async ({ page }) => {
		await page.goto('/admin/projects');
		await page.waitForLoadState('networkidle');

		await expect(page).toHaveURL(/\/admin\/projects/);

		await expect(page.locator('table')).toBeVisible();
		await expect(page.locator('th').first()).toBeVisible();
	});

	adminTest('should see OIDC providers list', async ({ page }) => {
		await page.goto('/admin/oidc-providers');
		await page.waitForLoadState('networkidle');

		await expect(page).toHaveURL(/\/admin\/oidc-providers/);

		// Either a table or an empty state message should be visible
		const hasTable = await page
			.locator('table')
			.isVisible()
			.catch(() => false);
		const hasEmpty = await page
			.locator('text=/no providers/i')
			.isVisible()
			.catch(() => false);
		const hasAddButton = await page.locator('a[href*="oidc-providers/new"]').first().isVisible();

		expect(hasTable || hasEmpty || hasAddButton).toBeTruthy();
	});

	adminTest('should see "Add Provider" button on OIDC providers page', async ({ page }) => {
		await page.goto('/admin/oidc-providers');
		await page.waitForLoadState('networkidle');

		await expect(page.locator('a[href*="oidc-providers/new"]').first()).toBeVisible();
	});

	adminTest('should navigate to audit logs page', async ({ page }) => {
		await page.goto('/admin/audit-logs');
		await page.waitForLoadState('networkidle');

		await expect(page).toHaveURL(/\/admin\/audit-logs/);

		await expect(page.locator('table')).toBeVisible();
		await expect(page.locator('th').first()).toBeVisible();
	});

	adminTest('should filter audit logs by navigating with URL params', async ({ page }) => {
		// Navigate with a date filter — the page should load without error
		const today = new Date().toISOString().slice(0, 10);
		await page.goto(`/admin/audit-logs?from=${today}&to=${today}`);
		await page.waitForLoadState('networkidle');

		await expect(page).toHaveURL(/\/admin\/audit-logs/);
		// The filter inputs should reflect the applied dates
		const fromInput = page.locator('input[type="date"]').first();
		await expect(fromInput).toBeVisible();
	});

	adminTest('should be able to use admin tab navigation', async ({ page }) => {
		await page.goto('/admin/users');
		await page.waitForLoadState('networkidle');

		// Click Projects tab
		await page.locator('nav a[href="/admin/projects"]').click();
		await page.waitForURL('**/admin/projects', { timeout: 10000 });
		await expect(page).toHaveURL(/\/admin\/projects/);

		// Click OIDC Providers tab
		await page.locator('nav a[href="/admin/oidc-providers"]').click();
		await page.waitForURL('**/admin/oidc-providers', { timeout: 10000 });
		await expect(page).toHaveURL(/\/admin\/oidc-providers/);

		// Click Audit Logs tab
		await page.locator('nav a[href="/admin/audit-logs"]').click();
		await page.waitForURL('**/admin/audit-logs', { timeout: 10000 });
		await expect(page).toHaveURL(/\/admin\/audit-logs/);
	});

	test('should block non-admin users from accessing admin panel', async ({ browser }) => {
		// Use a fresh context without any auth state (anonymous user)
		const context = await browser.newContext();
		const page = await context.newPage();

		await page.goto('http://localhost:5173/admin/users');
		await page.waitForLoadState('networkidle');
		// Should either redirect to login or show a 403 error
		const url = page.url();
		const isAuthError = await page
			.locator('body')
			.filter({ hasText: /401|403|authentication required|forbidden|admin access/i })
			.isVisible()
			.catch(() => false);
		const isRedirectedToLogin = url.includes('/auth/login');

		expect(isAuthError || isRedirectedToLogin).toBeTruthy();
		await context.close();
	});
});
