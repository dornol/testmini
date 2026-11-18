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
		await page.locator('form:has(input[value=COMPLETED]) button[type=submit]').click();
		await expect(page.locator('form:has(input[value=COMPLETED])')).toHaveCount(0);
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
					const trend = main.getByRole('table', { name: /합격률 추이|Pass Rate Trend/ });
					const outcomes = main.locator('dl[aria-labelledby=dashboard-status-heading]');
					const summaries = main.locator('details summary');
					await expect(trend).toHaveCount(0);
					await summaries.nth(0).press('Enter');
					await expect(trend.getByRole('link', { name: runName })).toBeVisible();
					await expect(trend.getByText('50%', { exact: false })).toBeVisible();
					await summaries.nth(1).press('Space');
					await expect(outcomes.locator('dd')).toHaveText(['1', '1', '0', '0', '0']);

					const customize = main.getByRole('button', {
						name: /대시보드 레이아웃 커스터마이즈|Customize dashboard layout/
					});
					await customize.press('Enter');
					const widgetPanel = main.locator('#dashboard-customizer');
					await expect(widgetPanel.getByRole('switch')).toHaveCount(6);
					expect(await widgetPanel.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
					const report = await new AxeBuilder({ page })
						.include('table[aria-labelledby=dashboard-recent-runs]')
						.include('dl[aria-labelledby=dashboard-priorities]')
						.include('table[aria-labelledby=dashboard-trend-heading]')
						.include('dl[aria-labelledby=dashboard-status-heading]')
						.include('#dashboard-customizer')
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
					if (locale === 'ko' && width === 375) {
						const section = widgetPanel.getByRole('listitem').first();
						await testInfo.attach('dashboard-widget-controls', {
							body: await section.screenshot({
								path: `/tmp/testmini-dashboard-widget-${theme}.png`
							}),
							contentType: 'image/png'
						});
					}
					await run.press('Enter');
					await expect(page).toHaveURL(new RegExp(runPath + '$'));
				});
			}
	test('keyboard changes the widget layout and a failed save can be retried', async ({
		page,
		request
	}, testInfo) => {
		await page.setViewportSize({ width: 375, height: 850 });
		const dashboard = `/projects/${projectId}`;
		const endpoint = `/api/projects/${projectId}/dashboard-layout`;
		await page.goto(dashboard);
		await page.waitForLoadState('networkidle');
		const open = page.getByRole('button', { name: '대시보드 레이아웃 커스터마이즈' });
		await open.press('Enter');
		const panel = page.getByRole('region', { name: '대시보드 위젯' });
		const up = panel.getByRole('button', { name: '합격률 추이 위로 이동' });
		await page.route('**' + endpoint, (route) =>
			route.fulfill({ status: 503, json: { message: 'Unavailable' } })
		);
		await up.press('Enter');
		await expect(up).toBeFocused();
		await expect(up).toHaveAttribute('aria-disabled', 'true');
		await expect(panel.getByRole('listitem').first()).toContainText('합격률 추이');
		await expect(page.getByRole('alert')).toContainText('저장하지 못했습니다');
		const stats = panel.getByRole('switch', { name: '요약 지표 위젯 표시 전환' });
		await stats.press('Space');
		await expect(stats).toHaveAttribute('aria-checked', 'false');
		await expect(page.getByRole('alert')).toContainText('저장하지 못했습니다');
		await page.unroute('**' + endpoint);
		await page.getByRole('button', { name: '다시 시도' }).press('Enter');
		await expect(page.getByText('대시보드 레이아웃이 저장되었습니다')).toBeVisible();
		const stored = await (await request.get(endpoint)).json();
		expect(stored.layout.slice(0, 2)).toMatchObject([
			{ id: 'pass_rate_trend', order: 0 },
			{ id: 'stats_summary', order: 1, visible: false }
		]);
		expect(await panel.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
		const accessibility = await new AxeBuilder({ page })
			.include('#dashboard-customizer')
			.withTags(['wcag2a', 'wcag2aa'])
			.analyze();
		expect(
			accessibility.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
		).toEqual([]);
		await testInfo.attach('dashboard-customizer', {
			body: await panel.screenshot({ path: '/tmp/testmini-dashboard-customizer-light.png' }),
			contentType: 'image/png'
		});
		await panel.getByRole('button', { name: '커스터마이즈 패널 닫기' }).press('Enter');
		await expect(open).toBeFocused();
		await page.reload();
		await page.waitForLoadState('networkidle');
		await open.press('Enter');
		await expect(panel.getByRole('listitem').first()).toContainText('합격률 추이');
		await expect(stats).toHaveAttribute('aria-checked', 'false');
	});
	test('a dashboard change stays with its project across client-side navigation', async ({
		page,
		request
	}) => {
		const response = await request.post('/api/projects', {
			data: { name: `Dashboard layout isolation ${Date.now()}` }
		});
		expect(response.ok()).toBe(true);
		const other = (await response.json()).data.id;
		const otherEndpoint = `/api/projects/${other}/dashboard-layout`;
		const firstEndpoint = `/api/projects/${projectId}/dashboard-layout`;
		try {
			expect(
				(
					await request.put(otherEndpoint, {
						data: {
							layout: [{ id: 'recent_runs', visible: true, order: 5, size: 'md' }]
						}
					})
				).ok()
			).toBe(true);
			await page.goto(`/projects/${projectId}`);
			await page.waitForLoadState('networkidle');
			const opener = page.getByRole('button', { name: '대시보드 레이아웃 커스터마이즈' });
			const panel = page.getByRole('region', { name: '대시보드 위젯' });
			await opener.click();
			await page.evaluate((href) => {
				document.documentElement.dataset.navigationCheck = 'same-document';
				const link = document.createElement('a');
				link.href = href;
				link.textContent = 'Open other dashboard';
				document.querySelector('main')!.prepend(link);
			}, `/projects/${other}`);
			const navigate = page.getByRole('link', { name: 'Open other dashboard' });
			await panel
				.getByRole('group', { name: '요약 지표 위젯 크기' })
				.getByRole('button', { name: '작게' })
				.click();
			await navigate.click();
			await expect(page).toHaveURL(new RegExp(`/projects/${other}$`));
			await expect(page.locator('html')).toHaveAttribute('data-navigation-check', 'same-document');
			await expect(panel).toHaveCount(0);
			await opener.click();
			await expect(panel.getByRole('listitem')).toHaveCount(6);
			await expect(panel.getByRole('listitem').first()).toContainText('최근 테스트 런');
			await expect(panel.getByRole('switch', { name: '요약 지표 위젯 표시 전환' })).toHaveAttribute(
				'aria-checked',
				'true'
			);
			await expect
				.poll(async () => {
					const { layout } = await (await request.get(firstEndpoint)).json();
					return layout.find((widget: { id: string }) => widget.id === 'stats_summary')?.size;
				})
				.toBe('sm');
			const { layout: savedOther } = await (await request.get(otherEndpoint)).json();
			expect(savedOther[0]).toMatchObject({ id: 'recent_runs', order: 0, size: 'md' });
			expect(
				savedOther.find((widget: { id: string }) => widget.id === 'stats_summary')
			).toMatchObject({ visible: true, size: 'lg' });
			expect(
				(
					await request.put(otherEndpoint, {
						data: {
							layout: savedOther.map((widget: object) => ({ ...widget, visible: false }))
						}
					})
				).ok()
			).toBe(true);
			await page.reload();
			await page.waitForLoadState('networkidle');
			await expect(page.getByText(/모든 위젯이 숨겨져 있습니다/)).toBeVisible();
			await opener.press('Enter');
			await panel.getByRole('button', { name: /기본/ }).press('Enter');
			await expect(page.getByText('대시보드 레이아웃이 저장되었습니다')).toBeVisible();
			await expect(page.getByTestId('dashboard-pass-rate')).toBeVisible();
		} finally {
			expect((await request.delete(`/api/projects/${other}`)).ok()).toBe(true);
		}
	});
});
