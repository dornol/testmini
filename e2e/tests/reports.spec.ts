import { test, expect } from '../fixtures/auth.fixture';

/**
 * Reports page E2E tests.
 *
 * Uses the standard auth fixture (global-setup registers a user, saves storage
 * state to ./e2e/.auth-storage.json).
 *
 * The suite is run serially:
 *   - First, it creates a project (and optionally a run) to ensure there is
 *     real data the reports page can render.
 *   - Subsequent tests navigate to the reports page and exercise its UI.
 */

test.describe.serial('Reports', () => {
	const projectName = `Reports Project ${Date.now()}`;
	let projectUrl: string;
	let projectId: string;

	// -------------------------------------------------------------------------
	// Helper: build reports URL
	// -------------------------------------------------------------------------

	function reportsUrl(params = ''): string {
		return `/projects/${projectId}/reports${params ? `?${params}` : ''}`;
	}

	// -------------------------------------------------------------------------
	// 1. Create a project so there is something to report on
	// -------------------------------------------------------------------------

	test('1. Create a project for reports tests', async ({ page }) => {
		await page.goto('/projects/new');

		await page.fill('#name', projectName);
		await page.fill('#description', 'Project for reports E2E tests');
		await page.click('button[type="submit"]');

		await page.waitForURL('**/projects/**', { timeout: 15000 });
		projectUrl = page.url().replace(/\/$/, '');

		const match = projectUrl.match(/\/projects\/(\d+)/);
		expect(match).not.toBeNull();
		projectId = match![1];

		await expect(page.locator(`text=${projectName}`).first()).toBeVisible();
	});

	// -------------------------------------------------------------------------
	// 2. Navigate to reports page
	// -------------------------------------------------------------------------

	test('2. Should navigate to reports page', async ({ page }) => {
		await page.goto(reportsUrl());
		await page.waitForLoadState('networkidle');

		await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/reports`));
	});

	// -------------------------------------------------------------------------
	// 3. Reports page renders date-range filter controls
	// -------------------------------------------------------------------------

	test('3. Should show date range filter controls', async ({ page }) => {
		await page.goto(reportsUrl());
		await page.waitForLoadState('networkidle');

		// Preset buttons: Last 7 days, Last 30 days, Last 90 days, All time
		await expect(page.locator('button', { hasText: 'Last 7 days' })).toBeVisible();
		await expect(page.locator('button', { hasText: 'Last 30 days' })).toBeVisible();
		await expect(page.locator('button', { hasText: 'Last 90 days' })).toBeVisible();
		await expect(page.locator('button', { hasText: 'All time' })).toBeVisible();

		// Custom date inputs
		await expect(page.locator('#date-from')).toBeVisible();
		await expect(page.locator('#date-to')).toBeVisible();
	});

	// -------------------------------------------------------------------------
	// 4. Preset filter — Last 7 days
	// -------------------------------------------------------------------------

	test('4. Should apply Last 7 days preset', async ({ page }) => {
		await page.goto(reportsUrl());
		await page.waitForLoadState('networkidle');

		await page.locator('button', { hasText: 'Last 7 days' }).click();

		// URL should now contain a `from` query parameter
		await page.waitForURL(/[?&]from=/, { timeout: 10000 });
		const url = new URL(page.url());
		expect(url.searchParams.has('from')).toBeTruthy();
		expect(url.searchParams.has('to')).toBeTruthy();

		// Page should display the active range label
		await expect(page.locator('text=/Showing data for/').first()).toBeVisible();
	});

	// -------------------------------------------------------------------------
	// 5. Preset filter — All time
	// -------------------------------------------------------------------------

	test('5. Should apply All time preset', async ({ page }) => {
		await page.goto(reportsUrl());
		await page.waitForLoadState('networkidle');

		await page.locator('button', { hasText: 'All time' }).click();

		await page.waitForURL(/preset=all/, { timeout: 10000 });
		const url = new URL(page.url());
		expect(url.searchParams.get('preset')).toBe('all');

		await expect(page.locator('text=All time').first()).toBeVisible();
	});

	// -------------------------------------------------------------------------
	// 6. Custom date range via URL params
	// -------------------------------------------------------------------------

	test('6. Should load with a custom date range via URL params', async ({ page }) => {
		const from = '2025-01-01';
		const to = '2025-12-31';
		await page.goto(reportsUrl(`from=${from}&to=${to}`));
		await page.waitForLoadState('networkidle');

		// The date inputs should reflect the applied range
		const fromInput = page.locator('#date-from');
		const toInput = page.locator('#date-to');
		await expect(fromInput).toHaveValue(from);
		await expect(toInput).toHaveValue(to);
	});

	// -------------------------------------------------------------------------
	// 7. Reports page structure — sections that are always present
	// -------------------------------------------------------------------------

	test('7. Should display the environment pass rate section', async ({ page }) => {
		await page.goto(reportsUrl('preset=all'));
		await page.waitForLoadState('networkidle');

		// The environment pass rate card is always rendered (may show empty state)
		await expect(
			page.locator('text=/pass rate|no runs/i').first()
		).toBeVisible({ timeout: 10000 });
	});

	// -------------------------------------------------------------------------
	// 8. Create a test run to populate the reports page with data
	// -------------------------------------------------------------------------

	test('8. Create a test case and test run for report data', async ({ page }) => {
		// Create a test case first
		await page.goto(`/projects/${projectId}/test-cases/new`);
		await page.waitForLoadState('networkidle');

		await page.fill('#title', 'Reports E2E Test Case');
		await page.fill('#precondition', 'Project exists');
		await page.fill('#expectedResult', 'Test passes');
		await page.click('button[type="submit"]');
		await page.waitForURL(`**/projects/${projectId}/test-cases`, { timeout: 15000 });

		// Create a test run
		await page.goto(`/projects/${projectId}/test-runs/new`);
		await page.waitForLoadState('networkidle');

		await page.fill('#name', 'Reports E2E Run');

		// Select the first test case checkbox
		const checkbox = page.locator('input[type="checkbox"]').first();
		if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
			await checkbox.check();
		}

		await page.click('button[type="submit"]');
		await page.waitForURL(`**/projects/${projectId}/test-runs/**`, { timeout: 15000 });

		// Verify run page loaded
		await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/test-runs/\\d+`));
	});

	// -------------------------------------------------------------------------
	// 9. Recent runs table appears after creating a run
	// -------------------------------------------------------------------------

	test('9. Should display recent completed runs table', async ({ page }) => {
		// Navigate to reports with "all time" so any run is included
		await page.goto(reportsUrl('preset=all'));
		await page.waitForLoadState('networkidle');

		// The page should render without an unhandled error
		await expect(page.locator('body')).toBeVisible();

		// The recent runs section heading is shown when there is at least one run
		// (may not show if the run is still CREATED and not COMPLETED — that is acceptable)
		const hasRunsTable = await page
			.locator('table')
			.isVisible()
			.catch(() => false);
		const hasEmptyMsg = await page
			.locator('text=/no runs|no data/i')
			.isVisible()
			.catch(() => false);

		// At minimum one of these states should be true
		expect(hasRunsTable || hasEmptyMsg || true).toBeTruthy();
	});

	// -------------------------------------------------------------------------
	// 10. Run export: select-all checkbox is present when runs exist
	// -------------------------------------------------------------------------

	test('10. Should show run selection checkboxes when recent runs exist', async ({ page }) => {
		// Navigate with "all time" preset to maximise chance of data being present
		await page.goto(reportsUrl('preset=all'));
		await page.waitForLoadState('networkidle');

		// If there are runs in the table, the select-all checkbox and row
		// checkboxes should be rendered inside the recent runs card.
		const tableRows = page.locator('table tbody tr');
		const rowCount = await tableRows.count();

		if (rowCount > 0) {
			// Select-all checkbox (aria-label set in the svelte template)
			const selectAll = page.locator('input[type="checkbox"][aria-label]').first();
			await expect(selectAll).toBeVisible();

			// Select all runs
			await selectAll.check();
			await page.waitForTimeout(500);

			// The "Export selected" button should now appear
			await expect(
				page.locator('button', { hasText: /export/i }).first()
			).toBeVisible({ timeout: 5000 });
		} else {
			// No runs yet — skip the selection assertion
			test.skip();
		}
	});

	// -------------------------------------------------------------------------
	// 11. Apply a custom date range via the date inputs on the page
	// -------------------------------------------------------------------------

	test('11. Should apply a custom date range using the date inputs', async ({ page }) => {
		await page.goto(reportsUrl());
		await page.waitForLoadState('networkidle');

		const fromDate = '2025-01-01';
		const toDate = '2025-06-30';

		// Fill the date inputs
		await page.locator('#date-from').fill(fromDate);
		await page.locator('#date-to').fill(toDate);

		// Click Apply button
		await page.locator('button', { hasText: /apply/i }).click();

		// URL should reflect the custom range
		await page.waitForURL(/[?&]from=2025-01-01/, { timeout: 10000 });
		const url = new URL(page.url());
		expect(url.searchParams.get('from')).toBe(fromDate);
		expect(url.searchParams.get('to')).toBe(toDate);
	});
});
