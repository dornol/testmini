import { test, expect } from '../fixtures/auth.fixture';
import AxeBuilder from '@axe-core/playwright';

test.describe.serial('Quality insights', () => {
	let projectId: number;
	let runPath: string;
	const moduleName = 'Module-' + 'LongName'.repeat(18);
	const runName = 'Automation-' + 'LongName'.repeat(18);

	test.afterAll(async ({ request }) => {
		if (projectId) expect((await request.delete(`/api/projects/${projectId}`)).ok()).toBe(true);
	});

	test('distinguishes no data from zero and prepares populated quality evidence', async ({
		page
	}) => {
		test.setTimeout(60000);
		const project = await page.request.post('/api/projects', {
			data: { name: `Quality UX ${Date.now()}` }
		});
		expect(project.ok()).toBe(true);
		projectId = (await project.json()).data.id;
		const base = `/projects/${projectId}`;
		await page.goto(`${base}/quality`);
		await expect(page.getByRole('heading', { name: '품질 인사이트' })).toBeVisible();
		await expect(page.getByText('—', { exact: true })).toHaveCount(3);
		await expect(page.getByText('자동화 실행 내역이 없습니다.')).toBeVisible();
		await expect(page.getByRole('table')).toHaveCount(0);

		await page.goto(`${base}/test-cases/new`);
		await page.waitForLoadState('networkidle');
		await page.locator('#title').fill('Automated quality case');
		await page.locator('#automationKey').fill('quality-automation');
		await page.locator('form button[type=submit]').click();
		await expect(page).toHaveURL(/\/test-cases\/\d+$/);
		const caseId = Number(page.url().split('/').pop());
		const risk = await page.request.patch(`/api${base}/test-cases/${caseId}/risk`, {
			data: { riskImpact: 'CRITICAL', riskLikelihood: 'CRITICAL' }
		});
		expect(risk.ok()).toBe(true);

		for (const name of [moduleName, 'Unlinked module']) {
			const created = await page.request.post(`/api${base}/modules`, { data: { name } });
			expect(created.ok()).toBe(true);
			if (name === moduleName) {
				const moduleId = (await created.json()).id;
				const linked = await page.request.post(`/api${base}/modules/${moduleId}/test-cases`, {
					data: { testCaseIds: [caseId] }
				});
				expect(linked.ok()).toBe(true);
			}
		}

		await page.goto(`${base}/test-runs/new`);
		await page.waitForLoadState('networkidle');
		await page.locator('#name').fill(runName);
		await page.getByRole('checkbox', { name: /Automated quality case/ }).check();
		await page.locator('button[type=submit]').click();
		await expect(page).toHaveURL(/\/test-runs\/\d+$/);
		runPath = new URL(page.url()).pathname;
		await page.locator('form[action*="updateRunStatus"] button[type=submit]').first().click();
		const status = page.locator('[data-status-dropdown]:visible').first();
		await status.click();
		await page.getByRole('menuitem', { name: 'PASS', exact: true }).click();
		await expect(status).toContainText('PASS');
	});

	for (const locale of ['ko', 'en'])
		for (const theme of ['light', 'dark'])
			for (const width of [375, 768, 1440]) {
				test(`${locale}/${theme}/${width}: readable metrics, module results and run link`, async ({
					page
				}, testInfo) => {
					await page.setViewportSize({ width, height: 850 });
					await page.goto(`/projects/${projectId}/quality`);
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
					const linked = page
						.getByRole('row')
						.filter({ has: page.getByRole('rowheader', { name: moduleName, exact: true }) });
					await expect(linked.getByRole('cell')).toHaveText(['1', '1', '0']);
					await expect(
						page.getByRole('row').filter({ hasText: 'Unlinked module' }).getByRole('cell')
					).toHaveText(['0', '0', '0']);
					await expect(
						page.getByRole('columnheader', { name: locale === 'en' ? 'Pass' : '합격', exact: true })
					).toBeVisible();
					await expect(page.getByText('50%', { exact: true })).toBeVisible();
					await expect(page.getByText('100%', { exact: true })).toHaveCount(2);
					await expect(
						page
							.getByText(locale === 'en' ? 'Critical-risk cases' : '치명적 위험 케이스')
							.locator('..')
							.getByText('1', { exact: true })
					).toBeVisible();
					const nativeLink = page.getByRole('link', { name: new RegExp(runName) });
					await expect(nativeLink).toHaveAttribute('href', runPath);
					await expect(nativeLink).toContainText(
						locale === 'en' ? 'Passed 1 of 1' : '1개 중 1개 합격'
					);
					expect(await page.locator('main').evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
						false
					);
					const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
					expect(
						audit.violations
							.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
							.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.failureSummary) }))
					).toEqual([]);
					if (width === 375 && locale === 'ko')
						await testInfo.attach('quality', {
							body: await page.screenshot({
								fullPage: true,
								path: `/tmp/testmini-quality-${theme}.png`
							}),
							contentType: 'image/png'
						});
					if (width === 375 && theme === 'dark' && locale === 'ko') {
						await nativeLink.press('Enter');
						await expect(page).toHaveURL(new RegExp(runPath + '$'));
					}
				});
			}
});
