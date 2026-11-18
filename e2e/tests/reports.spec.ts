import { test, expect } from '../fixtures/auth.fixture';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

async function checkReportChartData(page: Page) {
	const runChart = page.locator('[role=region][aria-labelledby=report-results-by-run]');
	const dailyChart = page.locator('[role=region][aria-labelledby=report-results-by-date]');
	for (const region of [runChart, dailyChart]) {
		await expect(region.getByRole('img')).toBeVisible();
		const summary = region.locator('summary');
		const table = region.getByRole('table');
		await expect(table).toHaveCount(0);
		await summary.press('Enter');
		await expect(summary).toBeFocused();
		await expect(table.getByRole('columnheader')).toHaveCount(5);
		const values = table.getByRole('cell');
		await expect(values).toHaveCount(4);
		for (const [index, count] of ['0', '1', '0', '0'].entries())
			await expect(values.nth(index)).toHaveAccessibleName(count);
		await expect(table.getByRole('rowheader')).toBeVisible();
		expect(await region.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
	}
	await expect(runChart.getByRole('rowheader')).toHaveText('Reports E2E Run');
}

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
	let publicChartShare: { id: number; token: string };
	let publicDateLabel: string;
	test.afterAll(async ({ request }) => {
		if (publicChartShare)
			expect(
				(
					await request.delete(`/api/projects/${projectId}/reports/share/${publicChartShare.id}`)
				).ok()
			).toBe(true);
		if (projectId) expect((await request.delete(`/api/projects/${projectId}`)).ok()).toBe(true);
	});

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

	test('8. Create a test case and test run for report data', async ({ page, request }) => {
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

		const caseId = Number(new URL(page.url()).pathname.split('/').at(-1));
		const issue = await request.post(`/api/projects/${projectId}/issue-links`, {
			data: { testCaseId: caseId, externalUrl: 'https://example.com/issues/1' }
		});
		expect(issue.status()).toBe(201);

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
		await page.getByRole('menuitem', { name: 'FAIL', exact: true }).click();
		const failure = page.getByRole('dialog', { name: /FAIL 처리/ });
		await failure.locator('#addErrorMessage').fill('Report fixture failure');
		await failure.getByRole('button', { name: 'FAIL 처리', exact: true }).click();
		await expect(page.locator('[data-status-dropdown]:visible').first()).toContainText('FAIL');
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

	test('report sharing retries, preserves the draft, and exposes the new URL only at creation', async ({
		page,
		playwright
	}, testInfo) => {
		await page.setViewportSize({ width: 375, height: 850 });
		await page.goto(reportsUrl('preset=all'));
		await page.waitForLoadState('networkidle');
		const endpoint = `/api/projects/${projectId}/reports/share`;
		const routePattern = '**' + endpoint;
		await page.route(routePattern, (route) =>
			route.fulfill({ status: 503, json: { message: 'Unavailable' } })
		);
		const opener = page.getByRole('button', { name: '리포트 공유', exact: true });
		await opener.click();
		const dialog = page.getByRole('dialog', { name: '리포트 공유' });
		await expect(dialog.getByRole('alert')).toBeVisible();
		await expect(dialog.getByText('공유 링크가 없습니다')).toHaveCount(0);
		await page.unroute(routePattern);
		await dialog.getByRole('button', { name: '다시 시도' }).click();
		const name = dialog.locator('#share-name');
		const expiry = dialog.locator('#share-expires');
		await expect(name).toBeEnabled();
		await name.fill('Recoverable report share');
		await expiry.fill('7');
		await page.route(routePattern, (route) =>
			route.fulfill({ status: 503, json: { message: 'Unavailable' } })
		);
		await name.press('Enter');
		await expect(dialog.getByRole('alert')).toBeFocused();
		await expect(dialog.getByRole('alert')).toContainText('저장하지 못했습니다');
		await expect(name).toHaveValue('Recoverable report share');
		await expect(expiry).toHaveValue('7');
		await page.unroute(routePattern);

		const newLink = dialog.locator('#new-share-url');
		await name.press('Enter');
		await expect(newLink).toHaveValue(/\/shared\/[a-f0-9]{64}$/);
		await expect(newLink).toBeFocused();
		const url = await newLink.inputValue();
		const publicClient = await playwright.request.newContext();
		try {
			expect((await publicClient.get(url)).ok()).toBe(true);
		} finally {
			await publicClient.dispose();
		}
		const list = await (await page.request.get(endpoint)).json();
		const saved = list.find((item: { name: string }) => item.name === 'Recoverable report share');
		expect(saved.config).toEqual({ preset: 'all_time' });
		expect(saved).not.toHaveProperty('token');
		await page.evaluate(() =>
			Object.defineProperty(navigator, 'clipboard', {
				configurable: true,
				value: {
					writeText: async () => {
						throw new Error('Clipboard denied');
					}
				}
			})
		);
		await dialog.getByRole('button', { name: '링크 복사' }).click();
		await expect(dialog.getByRole('alert')).toContainText('직접 복사');
		await expect(newLink).toBeFocused();
		const result = await new AxeBuilder({ page })
			.include('[data-slot=dialog-content]')
			.withTags(['wcag2a', 'wcag2aa'])
			.analyze();
		expect(
			result.violations
				.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))
				.map((v) => v.id)
		).toEqual([]);
		await testInfo.attach('share-dialog', {
			body: await page.screenshot({ mask: [newLink], path: '/tmp/testmini-report-share.png' }),
			contentType: 'image/png'
		});
		await page.keyboard.press('Escape');
		await expect(dialog).toHaveCount(0);
		await expect(opener).toBeFocused();
		await opener.click();
		await expect(
			dialog.locator('li p').filter({ hasText: /^Recoverable report share$/ })
		).toBeVisible();
		await expect(newLink).toHaveCount(0);
		await dialog.getByRole('button', { name: /링크 취소.*Recoverable report share/ }).click();
		await expect(
			dialog.locator('li p').filter({ hasText: /^Recoverable report share$/ })
		).toHaveCount(0);
		await expect(dialog.getByText('공유 링크가 없습니다')).toBeVisible();
		expect((await page.request.get(url)).status()).toBe(404);
	});

	test('schedule recovers from failed requests and preserves the true enabled state', async ({
		page
	}) => {
		await page.setViewportSize({ width: 375, height: 850 });
		await page.goto(reportsUrl('preset=all'));
		await page.waitForLoadState('networkidle');
		const endpoint = `/api/projects/${projectId}/reports/schedules`;
		const listRoute = '**' + endpoint;
		const fail = { status: 503, json: { message: 'Unavailable' } };
		await page.route(listRoute, (route) => route.fulfill(fail));
		const opener = page.getByRole('button', { name: '예약 리포트', exact: true });
		await opener.click();
		const dialog = page.getByRole('dialog', { name: '예약 리포트' });
		await expect(dialog.getByRole('alert')).toContainText('불러오지 못했습니다');
		await expect(dialog.getByText('예약된 리포트가 없습니다')).toHaveCount(0);
		await page.unroute(listRoute);
		await dialog.getByRole('button', { name: '다시 시도' }).click();
		await expect(dialog.getByText('예약된 리포트가 없습니다')).toBeVisible();
		const name = dialog.getByRole('textbox', { name: '예약 이름' });
		const recipients = dialog.getByRole('textbox', { name: '수신자' });
		await expect(name).toBeFocused();
		const create = dialog.getByRole('button', { name: '새 예약' });
		await name.fill('Recoverable report schedule');
		await dialog.getByRole('combobox', { name: '빈도' }).selectOption('0 9 1 * *');
		await dialog.getByRole('combobox', { name: '리포트 기간' }).selectOption('last_30_days');
		await recipients.fill('one@example.com, One@example.com');
		await create.click();
		await expect(dialog.getByRole('alert')).toBeFocused();
		await expect(dialog.getByRole('alert')).toContainText('중복 없이');
		await recipients.fill('one@example.com, two@example.com');
		await page.route(listRoute, (route) => route.fulfill(fail));
		await name.press('Enter');
		await expect(dialog.getByRole('alert')).toContainText('저장하지 못했습니다');
		await expect(name).toHaveValue('Recoverable report schedule');
		await expect(recipients).toHaveValue('one@example.com, two@example.com');
		await expect(dialog.getByRole('combobox', { name: '빈도' })).toHaveValue('0 9 1 * *');
		await page.unroute(listRoute);
		const created = page.waitForResponse(
			(response) =>
				response.url().endsWith(endpoint) && response.request().method() === 'POST' && response.ok()
		);
		await name.press('Enter');
		const schedule = await (await created).json();
		const detail = endpoint + '/' + schedule.id;
		try {
			expect(schedule.reportRange).toBe('last_30_days');
			expect(schedule.recipientEmails).toEqual(['one@example.com', 'two@example.com']);
			const toggle = dialog.getByRole('switch', { name: /Recoverable report schedule/ });
			await expect(toggle).toHaveAttribute('aria-checked', 'true');
			await expect(name).toHaveValue('');
			await page.route('**' + detail, (route) => route.fulfill(fail));
			await toggle.press('Space');
			await expect(dialog.getByRole('alert')).toBeFocused();
			await expect(toggle).toHaveAttribute('aria-checked', 'true');
			await page.unroute('**' + detail);
			await toggle.press('Space');
			await expect(toggle).toHaveAttribute('aria-checked', 'false');
			await page.keyboard.press('Escape');
			await expect(opener).toBeFocused();
			await opener.click();
			await expect(toggle).toHaveAttribute('aria-checked', 'false');
			const remove = dialog.getByRole('button', { name: /삭제.*Recoverable report schedule/ });
			page.once('dialog', (confirmation) => confirmation.dismiss());
			await remove.click();
			await expect(toggle).toBeVisible();
			page.once('dialog', (confirmation) => confirmation.accept());
			await remove.click();
			await expect(dialog.getByText('예약된 리포트가 없습니다')).toBeVisible();
			await expect(name).toBeFocused();
		} finally {
			const remaining = await (await page.request.get(endpoint)).json();
			if (remaining.some((item: { id: number }) => item.id === schedule.id))
				await page.request.delete(detail);
		}
	});

	test('execution charts disclose an empty date range', async ({ page }) => {
		await page.goto(reportsUrl('from=2001-01-01&to=2001-01-02'));
		await expect(page.getByText('이 기간의 실행 결과가 없습니다.')).toBeVisible();
		await expect(page.locator('canvas')).toHaveCount(0);
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
					const failedCases = page.getByRole('table', { name: /실패 빈도 Top|Top Failing/ });
					const defectDensity = page.getByRole('table', {
						name: /그룹별 결함 밀도|Defect Density/
					});
					await expect(
						failedCases.getByRole('link', { name: /Reports E2E Test Case/ })
					).toHaveAttribute('href', /test-cases\/\d+$/);
					for (const tableName of [
						/미실행 테스트 케이스|Stale Test Cases/,
						/가장 느린 테스트|Slowest Tests/
					])
						await expect(
							page
								.getByRole('table', { name: tableName })
								.getByRole('link', { name: /Reports E2E Test Case/ })
						).toBeVisible();
					await expect(defectDensity.getByRole('row')).toHaveCount(2);

					await checkReportChartData(page);
					const result = await new AxeBuilder({ page })
						.include('[data-slot=filter-toolbar]')
						.include('[data-testid=recent-completed-runs]')
						.include('.report-metrics')
						.include('[aria-labelledby=report-results-by-run]')
						.include('[aria-labelledby=report-results-by-date]')
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
					const share = filters.getByRole('button', { name: /^(리포트 공유|Share Report)$/ });
					await share.click();
					const shareDialog = page.getByRole('dialog');
					await expect(shareDialog.locator('#share-name')).toBeEnabled();
					expect(await shareDialog.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
					const shareAudit = await new AxeBuilder({ page })
						.include('[data-slot=dialog-content]')
						.withTags(['wcag2a', 'wcag2aa'])
						.analyze();
					expect(
						shareAudit.violations
							.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
							.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.failureSummary) }))
					).toEqual([]);
					await page.keyboard.press('Escape');
					await expect(shareDialog).toHaveCount(0);
					await expect(share).toBeFocused();
					const schedule = filters.getByRole('button', {
						name: /^(예약 리포트|Scheduled Reports)$/
					});
					await schedule.click();
					const scheduleDialog = page.getByRole('dialog');
					await expect(
						scheduleDialog.getByRole('button', { name: /새 예약|New Schedule/ })
					).toBeEnabled();
					expect(await scheduleDialog.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
						false
					);
					const scheduleControls = await scheduleDialog
						.locator('form input, form select, form button[type=submit]')
						.evaluateAll((controls) =>
							controls.map((control) => control.getBoundingClientRect().height)
						);
					expect(new Set(scheduleControls).size).toBe(1);

					const scheduleAudit = await new AxeBuilder({ page })
						.include('[data-slot=dialog-content]')
						.withTags(['wcag2a', 'wcag2aa'])
						.analyze();
					expect(
						scheduleAudit.violations
							.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
							.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.failureSummary) }))
					).toEqual([]);
					if (locale === 'ko' && width === 375)
						await testInfo.attach('report-schedule', {
							body: await page.screenshot({ path: `/tmp/testmini-report-schedule-${theme}.png` }),
							contentType: 'image/png'
						});
					await page.keyboard.press('Escape');
					await expect(scheduleDialog).toHaveCount(0);
					await expect(schedule).toBeFocused();
				});
			}
	test('public report presents an empty state outside execution dates', async ({
		request,
		browser,
		baseURL
	}) => {
		const endpoint = `/api/projects/${projectId}/reports/share`;
		const response = await request.post(endpoint, {
			data: { name: 'Public Empty Chart', config: { from: '2001-01-01', to: '2001-01-02' } }
		});
		expect(response.status()).toBe(201);
		const { id, token } = await response.json();
		const client = await browser.newContext({ baseURL, viewport: { width: 375, height: 850 } });
		try {
			const page = await client.newPage();
			await page.goto('/shared/' + token);
			const main = page.getByRole('main');
			await expect(
				main.getByRole('heading', { level: 1, name: 'Public Empty Chart' })
			).toBeVisible();
			await expect(main.getByText('이 기간의 실행 결과가 없습니다.')).toBeVisible();
			await expect(main.locator('canvas')).toHaveCount(0);
		} finally {
			await client.close();
			expect((await request.delete(endpoint + '/' + id)).ok()).toBe(true);
		}
	});

	test('create a public report with a calendar date range', async ({ request }) => {
		const now = new Date();
		const start = new Date(now);
		start.setDate(start.getDate() - 2);
		const end = new Date(now);
		end.setDate(end.getDate() + 1);
		const calendar = (date: Date) =>
			new Intl.DateTimeFormat('sv-SE', {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				timeZone: 'Asia/Seoul'
			}).format(date);
		const from = calendar(start);
		const to = calendar(end);
		const format = (value: string) =>
			new Date(value + 'T00:00:00Z').toLocaleDateString('en', {
				dateStyle: 'medium',
				timeZone: 'UTC'
			});
		publicDateLabel = `${format(from)} – ${format(to)}`;
		const share = await request.post(`/api/projects/${projectId}/reports/share`, {
			data: { name: 'Public Chart Data', config: { from, to } }
		});
		expect(share.status()).toBe(201);
		publicChartShare = await share.json();
	});

	for (const locale of ['ko', 'en'])
		for (const theme of ['light', 'dark'] as const)
			for (const width of [375, 768, 1440]) {
				test(`public ${locale}/${theme}/${width}: charts supply exact counts without sign-in`, async ({
					browser,
					baseURL
				}, testInfo) => {
					const client = await browser.newContext({
						baseURL,
						timezoneId: 'America/Los_Angeles',
						viewport: { width, height: 850 },
						colorScheme: theme,
						reducedMotion: 'reduce'
					});
					try {
						await client.addCookies([{ name: 'PARAGLIDE_LOCALE', value: locale, url: baseURL! }]);
						const page = await client.newPage();
						await page.goto('/shared/' + publicChartShare.token);
						await expect(page.locator('html')).toHaveAttribute('lang', locale);
						if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/\bdark\b/);
						else await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
						const report = page.getByRole('main');
						await expect(
							report.getByRole('heading', { level: 1, name: 'Public Chart Data' })
						).toBeVisible();
						if (locale === 'en')
							await expect(report.getByText(publicDateLabel, { exact: false })).toBeVisible();
						await checkReportChartData(page);
						const audit = await new AxeBuilder({ page })
							.include('[aria-labelledby=report-results-by-run]')
							.include('[aria-labelledby=report-results-by-date]')
							.withTags(['wcag2a', 'wcag2aa'])
							.analyze();
						expect(
							audit.violations.filter((violation) =>
								['serious', 'critical'].includes(violation.impact ?? '')
							)
						).toEqual([]);
						expect(
							await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
						).toBe(false);
						if (locale === 'en' && width === 375) {
							const chart = page.locator('[role=region][aria-labelledby=report-results-by-run]');
							await testInfo.attach('public-report-chart', {
								body: await chart.screenshot({ path: `/tmp/testmini-public-chart-${theme}.png` }),
								contentType: 'image/png'
							});
						}
					} finally {
						await client.close();
					}
				});
			}
});
