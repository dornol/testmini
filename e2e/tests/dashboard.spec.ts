import { test, expect } from '../fixtures/auth.fixture';

/**
 * Dashboard E2E tests.
 *
 * Covers: project dashboard navigation, widget rendering,
 * sidebar navigation, chart sections.
 */

test.describe.serial('Dashboard & Navigation', () => {
	const ts = Date.now();
	const projectName = `Dashboard Project ${ts}`;
	let projectId: string;

	test('1. Create a project', async ({ page }) => {
		await page.goto('/projects/new');
		await page.fill('#name', projectName);
		await page.fill('#description', 'E2E dashboard test project');
		await page.click('button[type="submit"]');
		await page.waitForURL('**/projects/**', { timeout: 15000 });

		const match = page.url().match(/\/projects\/(\d+)/);
		expect(match).not.toBeNull();
		projectId = match![1];
	});

	test('2. Dashboard page loads with project name', async ({ page }) => {
		await page.goto(`/projects/${projectId}`);
		await page.waitForLoadState('networkidle');

		await expect(page.locator(`text=${projectName}`).first()).toBeVisible({ timeout: 10000 });
	});

	test('3. Dashboard shows summary cards', async ({ page }) => {
		await page.goto(`/projects/${projectId}`);
		await page.waitForLoadState('networkidle');

		// Dashboard should have summary cards (test cases, test runs, etc.)
		const cards = page.locator('[class*="card"], [data-testid*="card"]');
		const count = await cards.count();
		expect(count).toBeGreaterThan(0);
	});

	test('4. Sidebar shows project and sub-navigation links', async ({ page }) => {
		await page.goto(`/projects/${projectId}`);
		await page.waitForLoadState('networkidle');

		// Sidebar nav should be visible on desktop
		const nav = page.locator('nav[aria-label="Main navigation"]');
		await expect(nav).toBeVisible({ timeout: 5000 });

		// Should have links to test cases, test runs, reports
		const testCasesLink = nav.locator(`a[href*="/projects/${projectId}/test-cases"]`);
		await expect(testCasesLink).toBeVisible();

		const testRunsLink = nav.locator(`a[href*="/projects/${projectId}/test-runs"]`);
		await expect(testRunsLink).toBeVisible();

		const reportsLink = nav.locator(`a[href*="/projects/${projectId}/reports"]`);
		await expect(reportsLink).toBeVisible();
	});

	test('5. Navigate to test cases from sidebar', async ({ page }) => {
		await page.goto(`/projects/${projectId}`);
		await page.waitForLoadState('networkidle');

		const nav = page.locator('nav[aria-label="Main navigation"]');
		const tcLink = nav.locator(`a[href*="/projects/${projectId}/test-cases"]`);
		await tcLink.click();
		await page.waitForURL(`**/projects/${projectId}/test-cases`, { timeout: 10000 });
	});

	test('6. Navigate to test runs from sidebar', async ({ page }) => {
		await page.goto(`/projects/${projectId}`);
		await page.waitForLoadState('networkidle');

		const nav = page.locator('nav[aria-label="Main navigation"]');
		const trLink = nav.locator(`a[href*="/projects/${projectId}/test-runs"]`);
		await trLink.click();
		await page.waitForURL(`**/projects/${projectId}/test-runs`, { timeout: 10000 });
	});

	test('7. Navigate to reports from sidebar', async ({ page }) => {
		await page.goto(`/projects/${projectId}`);
		await page.waitForLoadState('networkidle');

		const nav = page.locator('nav[aria-label="Main navigation"]');
		const repLink = nav.locator(`a[href*="/projects/${projectId}/reports"]`);
		await repLink.click();
		await page.waitForURL(`**/projects/${projectId}/reports`, { timeout: 10000 });
	});

	test('8. Projects list page shows the created project', async ({ page }) => {
		await page.goto('/projects');
		await page.waitForLoadState('networkidle');

		await expect(page.locator(`text=${projectName}`).first()).toBeVisible({ timeout: 10000 });
	});
});
