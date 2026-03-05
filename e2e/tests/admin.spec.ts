import { test, expect, chromium } from '@playwright/test';
import postgres from 'postgres';

/**
 * Admin panel E2E tests.
 *
 * The admin panel requires the authenticated user to have role === 'admin'.
 * The global-setup registers a regular user, so this suite registers its own
 * dedicated admin user, promotes it via direct DB update, then saves a separate
 * auth storage state that is reused across all tests in this file.
 */

const ADMIN_STORAGE = './e2e/.auth-admin-storage.json';
const ADMIN_EMAIL = `e2e-admin-${Date.now()}@test.com`;
const ADMIN_PASSWORD = 'TestPassword123!';

// ---------------------------------------------------------------------------
// One-time setup: create & promote admin user, save storage state.
// Runs before all tests in this describe block.
// ---------------------------------------------------------------------------

let adminStorageReady = false;

async function ensureAdminStorage() {
	if (adminStorageReady) return;

	const browser = await chromium.launch();
	const context = await browser.newContext();
	const page = await context.newPage();

	// 1. Register the admin user via the UI
	await page.goto('http://localhost:5173/auth/register');
	await page.fill('#name', 'E2E Admin User');
	await page.fill('#email', ADMIN_EMAIL);
	await page.fill('#password', ADMIN_PASSWORD);
	await page.fill('#passwordConfirm', ADMIN_PASSWORD);
	await page.click('button[type="submit"]');
	await page.waitForURL('**/projects', { timeout: 15000 });

	// 2. Promote the user to admin via direct DB update
	const DATABASE_URL =
		process.env.DATABASE_URL ?? 'postgres://root:mysecretpassword@localhost:5432/local';
	const sql = postgres(DATABASE_URL);
	await sql`UPDATE "user" SET role = 'admin' WHERE email = ${ADMIN_EMAIL}`;
	await sql.end();

	// 3. Re-login so the session picks up the updated role
	await context.clearCookies();
	await page.goto('http://localhost:5173/auth/login');
	await page.fill('#email', ADMIN_EMAIL);
	await page.fill('#password', ADMIN_PASSWORD);
	await page.click('button[type="submit"]');
	await page.waitForURL('**/projects', { timeout: 15000 });

	// 4. Persist auth state
	await context.storageState({ path: ADMIN_STORAGE });
	await browser.close();

	adminStorageReady = true;
}

// ---------------------------------------------------------------------------
// Helper: create a test that uses the admin storage state
// ---------------------------------------------------------------------------

function adminTest(
	title: string,
	fn: (args: { page: import('@playwright/test').Page }) => Promise<void>
) {
	test(title, async ({ browser }) => {
		await ensureAdminStorage();
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

		// Table headers
		await expect(page.locator('th').filter({ hasText: /name/i }).first()).toBeVisible();
		await expect(page.locator('th').filter({ hasText: /email/i }).first()).toBeVisible();
		await expect(page.locator('th').filter({ hasText: /role/i }).first()).toBeVisible();
		await expect(page.locator('th').filter({ hasText: /status/i }).first()).toBeVisible();
	});

	adminTest('should display the admin user in the users list', async ({ page }) => {
		await page.goto('/admin/users');
		await page.waitForLoadState('networkidle');

		// The E2E admin user we just created should appear
		await expect(page.locator(`text=E2E Admin User`).first()).toBeVisible({ timeout: 10000 });
	});

	adminTest('should search for a user by name', async ({ page }) => {
		await page.goto('/admin/users');
		await page.waitForLoadState('networkidle');

		// Fill the search input and submit
		const searchInput = page.locator('input[placeholder]').first();
		await searchInput.fill('E2E Admin');
		await page.locator('button[type="submit"]').first().click();

		await page.waitForLoadState('networkidle');
		await expect(page.locator('text=E2E Admin User').first()).toBeVisible({ timeout: 10000 });
	});

	adminTest('should navigate to projects list in admin panel', async ({ page }) => {
		await page.goto('/admin/projects');
		await page.waitForLoadState('networkidle');

		await expect(page).toHaveURL(/\/admin\/projects/);

		// Table headers for projects
		await expect(page.locator('th').filter({ hasText: /name/i }).first()).toBeVisible();
		await expect(page.locator('th').filter({ hasText: /status/i }).first()).toBeVisible();
	});

	adminTest('should see OIDC providers list', async ({ page }) => {
		await page.goto('/admin/oidc-providers');
		await page.waitForLoadState('networkidle');

		await expect(page).toHaveURL(/\/admin\/oidc-providers/);

		// Either a table or an empty state message should be visible
		const hasTable = await page.locator('table').isVisible().catch(() => false);
		const hasEmpty = await page
			.locator('text=/no providers/i')
			.isVisible()
			.catch(() => false);
		const hasAddButton = await page.locator('a[href*="oidc-providers/new"]').isVisible();

		expect(hasTable || hasEmpty || hasAddButton).toBeTruthy();
	});

	adminTest('should see "Add Provider" button on OIDC providers page', async ({ page }) => {
		await page.goto('/admin/oidc-providers');
		await page.waitForLoadState('networkidle');

		await expect(page.locator('a[href*="oidc-providers/new"]')).toBeVisible();
	});

	adminTest('should navigate to audit logs page', async ({ page }) => {
		await page.goto('/admin/audit-logs');
		await page.waitForLoadState('networkidle');

		await expect(page).toHaveURL(/\/admin\/audit-logs/);

		// Table headers
		await expect(page.locator('th').filter({ hasText: /date/i }).first()).toBeVisible();
		await expect(page.locator('th').filter({ hasText: /user/i }).first()).toBeVisible();
		await expect(page.locator('th').filter({ hasText: /action/i }).first()).toBeVisible();
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
		// Should either redirect to login or show a 403 error
		const url = page.url();
		const is403 = await page
			.locator('text=/403|forbidden|admin access/i')
			.isVisible()
			.catch(() => false);
		const isRedirectedToLogin = url.includes('/auth/login') || url.includes('/auth/register');

		expect(is403 || isRedirectedToLogin).toBeTruthy();
		await context.close();
	});
});
