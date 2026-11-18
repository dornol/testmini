import { test, expect } from '../fixtures/auth.fixture';
import AxeBuilder from '@axe-core/playwright';

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
	let runPath: string;
	const runName = 'Dashboard run ' + 'longidentifier'.repeat(8);
	test.afterAll(async ({ request }) => {
		if (projectId) expect((await request.delete(`/api/projects/${projectId}`)).ok()).toBe(true);
	});

	test('1. Create a project', async ({ page }) => {
		await page.goto('/projects/new');
		await page.fill('#name', projectName);
		await page.fill('#description', 'E2E dashboard test project');
		await page.click('button[type="submit"]');
		await page.waitForURL(/\/projects\/\d+$/, { timeout: 15000 });

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
		const nav = page.getByRole('navigation', { name: /Main navigation|주요 탐색/ });
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

		const nav = page.getByRole('navigation', { name: /Main navigation|주요 탐색/ });
		const tcLink = nav.locator(`a[href*="/projects/${projectId}/test-cases"]`);
		await tcLink.click();
		await page.waitForURL(`**/projects/${projectId}/test-cases`, { timeout: 10000 });
	});

	test('6. Navigate to test runs from sidebar', async ({ page }) => {
		await page.goto(`/projects/${projectId}`);
		await page.waitForLoadState('networkidle');

		const nav = page.getByRole('navigation', { name: /Main navigation|주요 탐색/ });
		const trLink = nav.locator(`a[href*="/projects/${projectId}/test-runs"]`);
		await trLink.click();
		await page.waitForURL(`**/projects/${projectId}/test-runs`, { timeout: 10000 });
	});

	test('7. Navigate to reports from sidebar', async ({ page }) => {
		await page.goto(`/projects/${projectId}`);
		await page.waitForLoadState('networkidle');

		const nav = page.getByRole('navigation', { name: /Main navigation|주요 탐색/ });
		const repLink = nav.locator(`a[href*="/projects/${projectId}/reports"]`);
		await repLink.click();
		await page.waitForURL(`**/projects/${projectId}/reports`, { timeout: 10000 });
	});

	test('8. Projects list page shows the created project', async ({ page }) => {
		await page.goto('/projects');
		await page.waitForLoadState('networkidle');

		await expect(page.locator(`text=${projectName}`).first()).toBeVisible({ timeout: 10000 });
	});
	test('empty dashboard leads to the first case and then the first run', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 850 });
		await page.goto(`/projects/${projectId}`);
		await page.waitForLoadState('networkidle');
		const main = page.getByRole('main');
		await expect(main.getByTestId('dashboard-pass-rate')).toHaveText('—');
		const onboarding = main.locator('[data-slot=empty-state]');
		const start = onboarding.getByRole('link', { name: '테스트 케이스 만들기' });
		await expect(start).toHaveAttribute('href', `/projects/${projectId}/test-cases/new`);
		await start.press('Enter');
		await page.waitForURL('**/test-cases/new');
		await page.waitForLoadState('networkidle');
		await page.locator('#title').fill('Dashboard case one');
		await page.locator('button[type=submit]').click();
		await page.waitForURL(/test-cases\/\d+$/);
		await page.goto(`/projects/${projectId}`);
		await expect(onboarding.getByRole('link', { name: '테스트 런 만들기' })).toHaveAttribute(
			'href',
			`/projects/${projectId}/test-runs/new`
		);
	});

	test('dashboard distinguishes pending from executed cases in its metrics and run table', async ({
		page
	}) => {
		await page.goto(`/projects/${projectId}/test-cases/new`);
		await page.waitForLoadState('networkidle');
		await page.locator('#title').fill('Dashboard case two');
		await page.locator('button[type=submit]').click();
		await page.waitForURL(/test-cases\/\d+$/);
		await page.goto(`/projects/${projectId}/test-runs/new`);
		await page.waitForLoadState('networkidle');
		await page.locator('#name').fill(runName);
		for (const name of ['Dashboard case one', 'Dashboard case two'])
			await page
				.locator('#run-cases')
				.getByRole('checkbox', { name: new RegExp(name) })
				.check();
		await page.locator('button[type=submit]').click();
		await page.waitForURL(/test-runs\/\d+$/);
		runPath = new URL(page.url()).pathname;

		const dashboard = `/projects/${projectId}`;
		await page.goto(dashboard);
		const recent = page.getByRole('table', { name: '최근 테스트 런' });
		await expect(recent.getByRole('link', { name: runName })).toBeVisible();
		await expect(page.getByTestId('dashboard-pass-rate')).toHaveText('—');
		await expect(recent.getByText('아직 실행된 케이스가 없습니다')).toBeVisible();
		await recent.getByRole('link', { name: runName }).press('Enter');
		await page.waitForURL(`**${runPath}`);
		await page.locator('form[action*="updateRunStatus"] button[type=submit]').first().click();
		await expect(
			page.locator('form:has(input[value=COMPLETED]) button[type=submit]')
		).toBeVisible();
		await expect(page.getByText('실시간', { exact: true })).toBeVisible();
		const caseOne = page.getByRole('row').filter({ hasText: 'Dashboard case one' });
		await caseOne.locator('[data-status-dropdown]:visible').click();
		await page.getByRole('menuitem', { name: 'PASS', exact: true }).click();
		await expect(caseOne.locator('[data-status-dropdown]:visible')).toContainText('PASS');

		await page.goto(dashboard);
		await expect(page.getByTestId('dashboard-pass-rate')).toHaveText('100%');
		await expect(recent.getByText(/100%/)).toBeVisible();
		await expect(page.getByText('실행 1건 중 1건 합격')).toBeVisible();
		await expect(page.locator('dl[aria-labelledby=dashboard-priorities] dd')).toHaveText('2');
		await expect(
			page.locator('ul[aria-labelledby=dashboard-activity]').getByRole('link', { name: runName })
		).toHaveAttribute('href', runPath);

		await page.goto(runPath);
		await expect(page.getByText('실시간', { exact: true })).toBeVisible();
		const caseTwo = page.getByRole('row').filter({ hasText: 'Dashboard case two' });
		await caseTwo.locator('[data-status-dropdown]:visible').click();
		await page.getByRole('menuitem', { name: 'FAIL', exact: true }).click();
		const failure = page.getByRole('dialog', { name: /FAIL 처리/ });
		await failure.locator('#addErrorMessage').fill('Dashboard activity fixture');
		await failure.getByRole('button', { name: 'FAIL 처리', exact: true }).click();
		await expect(caseTwo.locator('[data-status-dropdown]:visible')).toContainText('FAIL');
		await page.goto(dashboard);
		await expect(page.getByTestId('dashboard-pass-rate')).toHaveText('50%');
		await expect(
			page
				.locator('ul[aria-labelledby=dashboard-recent-failures]')
				.getByRole('link', { name: runName })
		).toHaveAttribute('href', runPath);
	});

	for (const locale of ['ko', 'en'])
		for (const theme of ['light', 'dark'])
			for (const width of [375, 768, 1440]) {
				test(`${locale}/${theme}/${width}: dashboard results fit and support keyboard navigation`, async ({
					page
				}, testInfo) => {
					await page.setViewportSize({ width, height: 850 });
					await page.goto(`/projects/${projectId}`);
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
					const main = page.getByRole('main');
					const recent = main.locator('table[aria-labelledby=dashboard-recent-runs]');
					const run = recent.getByRole('link', { name: runName });
					await expect(run).toHaveAttribute('href', runPath);
					await expect(recent.getByRole('columnheader')).toHaveCount(5);
					await expect(recent.getByText('DEV')).toBeVisible();
					expect(await main.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
					const report = await new AxeBuilder({ page })
						.include('table[aria-labelledby=dashboard-recent-runs]')
						.include('dl[aria-labelledby=dashboard-priorities]')
						.include('ul[aria-labelledby=dashboard-activity]')
						.include('ul[aria-labelledby=dashboard-recent-failures]')
						.withTags(['wcag2a', 'wcag2aa'])
						.analyze();
					expect(
						report.violations.filter((violation) =>
							['serious', 'critical'].includes(violation.impact ?? '')
						)
					).toEqual([]);
					if (locale === 'ko' && width === 375)
						await testInfo.attach('dashboard-recent-runs', {
							body: await recent.screenshot({ path: `/tmp/testmini-dashboard-runs-${theme}.png` }),
							contentType: 'image/png'
						});
					await run.press('Enter');
					await expect(page).toHaveURL(new RegExp(runPath + '$'));
				});
			}
});
