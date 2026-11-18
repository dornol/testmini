import { test, expect } from '../fixtures/auth.fixture';
import AxeBuilder from '@axe-core/playwright';

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

		await page.waitForURL(/\/projects\/\d+$/, { timeout: 15000 });
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

		await expect(
			page
				.locator('button')
				.filter({ hasText: /7|일|day/i })
				.first()
		).toBeVisible();
		await expect(
			page
				.locator('button')
				.filter({ hasText: /30|일|day/i })
				.first()
		).toBeVisible();
		await expect(
			page
				.locator('button')
				.filter({ hasText: /90|일|day/i })
				.first()
		).toBeVisible();
		await expect(page.locator('#date-from')).toBeVisible();
		await expect(page.locator('#date-to')).toBeVisible();
	});

	// -------------------------------------------------------------------------
	// 4. Preset filter — Last 7 days
	// -------------------------------------------------------------------------

	test('4. Should apply Last 7 days preset', async ({ page }) => {
		await page.goto(reportsUrl());
		await page.waitForLoadState('networkidle');

		await page.locator('button', { hasText: /Last 7 days|최근 7일/i }).click();

		// URL should now contain a `from` query parameter
		await page.waitForURL(/[?&]from=/, { timeout: 10000 });
		const url = new URL(page.url());
		expect(url.searchParams.has('from')).toBeTruthy();
		expect(url.searchParams.has('to')).toBeTruthy();

		// Page should display the active range label
		await expect(page.locator('text=/Showing data for|표시 기간/').first()).toBeVisible();
	});

	// -------------------------------------------------------------------------
	// 5. Preset filter — All time
	// -------------------------------------------------------------------------

	test('5. Should apply All time preset', async ({ page }) => {
		await page.goto(reportsUrl());
		await page.waitForLoadState('networkidle');

		await page.locator('button', { hasText: /All time|전체 기간/i }).click();

		await page.waitForURL(/preset=all/, { timeout: 10000 });
		const url = new URL(page.url());
		expect(url.searchParams.get('preset')).toBe('all');

		await expect(page.locator('text=/All time|전체 기간/').first()).toBeVisible();
	});

	// -------------------------------------------------------------------------
	// 6. Custom date range via URL params
	// -------------------------------------------------------------------------

	test('6. Should load with a custom date range via URL params', async ({ page }) => {
		const from = '2025-01-01';
		const to = '2025-12-31';
		await page.goto(reportsUrl(`from=${from}&to=${to}`));
		await page.waitForLoadState('networkidle');

		const fromInput = page.locator('#date-from');
		const toInput = page.locator('#date-to');
		await expect(fromInput).toBeVisible();
		await expect(toInput).toBeVisible();
		expect(new URL(page.url()).searchParams.get('from')).toBe(from);
		expect(new URL(page.url()).searchParams.get('to')).toBe(to);
	});

	// -------------------------------------------------------------------------
	// 7. Reports page structure — sections that are always present
	// -------------------------------------------------------------------------

	test('7. Should display the environment pass rate section', async ({ page }) => {
		await page.goto(reportsUrl('preset=all'));
		await page.waitForLoadState('networkidle');

		// The environment pass rate card is always rendered (may show empty state)
		await expect(
			page.locator('text=/pass rate|no runs|환경별 합격률|아직 테스트 런이 없습니다/i').first()
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
		await page.waitForURL(new RegExp(`/projects/${projectId}/test-cases/\\d+$`), {
			timeout: 15000
		});

		// Create a test run
		await page.goto(`/projects/${projectId}/test-runs/new`);
		await page.waitForLoadState('networkidle');

		await page.fill('#name', 'Reports E2E Run');

		// Select the named case independently of the picker's layout.
		await page
			.locator('#run-cases')
			.getByRole('checkbox', { name: /Reports E2E Test Case/ })
			.check();

		await page.click('button[type="submit"]');
		await page.waitForURL(new RegExp(`/projects/${projectId}/test-runs/\\d+$`), { timeout: 15000 });

		// Complete the run so the report includes real results.
		await page.locator('form[action*="updateRunStatus"] button[type=submit]').first().click();
		await page.locator('[data-status-dropdown]:visible').first().click();
		await page.getByRole('menuitem', { name: 'PASS', exact: true }).click();
		await expect(page.locator('[data-status-dropdown]:visible').first()).toContainText('PASS');
		await page.locator('form:has(input[value=COMPLETED]) button[type=submit]').click();
		await expect(page.locator('form:has(input[value=COMPLETED])')).toHaveCount(0);
	});

	test('completed runs link to the run and export only selected visible rows', async ({ page }) => {
		await page.goto(reportsUrl('preset=all'));
		await page.waitForLoadState('networkidle');
		const recentRuns = page.getByTestId('recent-completed-runs');
		const run = recentRuns.getByRole('link', { name: 'Reports E2E Run', exact: true });
		await expect(run).toHaveAttribute('href', /test-runs\/\d+$/);
		const select = recentRuns.getByRole('checkbox', {
			name: /Reports E2E Run.*선택|선택.*Reports E2E Run/
		});
		await select.check();
		await expect(recentRuns.getByRole('button', { name: '선택 내보내기 (1)' })).toBeVisible();
		await page.locator('#date-from').fill('2025-01-01');
		await page.locator('#date-to').fill('2025-01-02');
		await page.getByRole('button', { name: '적용', exact: true }).click();
		await expect(page).toHaveURL(/from=2025-01-01/);
		await expect(run).toHaveCount(0);
		await expect(page.getByRole('button', { name: /선택 내보내기/ })).toHaveCount(0);
		await page.goBack();
		await expect(run).toBeVisible();
		await expect(select).not.toBeChecked();
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
		await page.locator('button', { hasText: /apply|적용/i }).click();

		// URL should reflect the custom range
		await page.waitForURL(/[?&]from=2025-01-01/, { timeout: 10000 });
		const url = new URL(page.url());
		expect(url.searchParams.get('from')).toBe(fromDate);
		expect(url.searchParams.get('to')).toBe(toDate);
	});

	test('keeps both calendar dates through edit, reload, and browser history', async ({ page }) => {
		await page.goto(reportsUrl('from=2025-06-01&to=2025-06-30&extra=keep'));
		await page.waitForLoadState('networkidle');
		const from = page.locator('#date-from');
		const to = page.locator('#date-to');
		await expect(from).toHaveValue('2025-06-01');
		await expect(to).toHaveValue('2025-06-30');
		await to.fill('');
		await page.getByRole('button', { name: '적용', exact: true }).click();
		await expect(page.getByRole('alert')).toBeFocused();
		await expect(to).toHaveValue('');
		await expect(to).toHaveAttribute('aria-invalid', 'true');
		await to.fill('2025-01-01');
		await page.getByRole('button', { name: '적용', exact: true }).click();
		await expect(page.getByRole('alert')).toContainText('종료일은 시작일 이후');
		await expect(page).toHaveURL(/to=2025-06-30/);
		await to.fill('2025-06-29');
		await to.press('Enter');
		await expect(page).toHaveURL(/to=2025-06-29/);
		expect(new URL(page.url()).searchParams.get('extra')).toBe('keep');
		await page.reload();
		await expect(from).toHaveValue('2025-06-01');
		await expect(to).toHaveValue('2025-06-29');
		await page.waitForLoadState('networkidle');
		const all = page.getByRole('button', { name: '전체 기간', exact: true });
		await all.click();
		await expect(all).toHaveAttribute('aria-pressed', 'true');
		await expect(from).toHaveValue('');
		await page.goBack();
		await expect(to).toHaveValue('2025-06-29');
		await expect(all).toHaveAttribute('aria-pressed', 'false');
		await page.goForward();
		await expect(from).toHaveValue('');
		await expect(all).toHaveAttribute('aria-pressed', 'true');
	});

	test('discloses fallback when a saved URL has an invalid range', async ({ page }) => {
		for (const query of ['from=2025-02-30&to=2025-06-01', 'from=2025-12-31&to=2025-01-01']) {
			await page.goto(reportsUrl(query));
			await expect(
				page.getByText('링크의 기간이 올바르지 않아 최근 30일 보고서를 표시합니다.')
			).toBeVisible();
			await expect(page.locator('#date-from')).not.toHaveValue(
				new URLSearchParams(query).get('from')!
			);
		}
	});

	for (const locale of ['ko', 'en'])
		for (const theme of ['light', 'dark'])
			for (const width of [375, 768, 1440]) {
				test(`${locale}/${theme}/${width}: report controls and completed runs remain usable`, async ({
					page
				}, testInfo) => {
					await page.setViewportSize({ width, height: 850 });
					await page.goto(reportsUrl('preset=all'));
					await page.waitForLoadState('networkidle');
					if (locale === 'en') {
						await page.getByRole('button', { name: '언어 변경' }).click();
						await page.getByRole('menuitem', { name: 'English' }).click();
						await expect(page.locator('html')).toHaveAttribute('lang', 'en');
						await page.waitForLoadState('networkidle');
					}
					if (
						(await page.locator('html').evaluate((el) => el.classList.contains('dark'))) !==
						(theme === 'dark')
					)
						await page.getByRole('button', { name: /테마 변경|Toggle theme/ }).click();
					const filters = page.locator('[data-slot=filter-toolbar]');
					const recentRuns = page.getByTestId('recent-completed-runs');
					await expect(recentRuns.getByRole('link', { name: /Reports E2E Run/ })).toBeVisible();
					await filters.locator('button[type=submit]').click();
					await expect(filters.getByRole('alert')).toBeFocused();
					expect(await page.locator('main').evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
						false
					);
					const result = await new AxeBuilder({ page })
						.include('[data-slot=filter-toolbar]')
						.include('[data-testid=recent-completed-runs]')
						.withTags(['wcag2a', 'wcag2aa'])
						.analyze();
					expect(
						result.violations
							.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
							.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.failureSummary) }))
					).toEqual([]);
					if (locale === 'ko' && width === 375)
						await testInfo.attach('report-range', {
							body: await page.screenshot({ path: `/tmp/testmini-report-range-${theme}.png` }),
							contentType: 'image/png'
						});
				});
			}
});
