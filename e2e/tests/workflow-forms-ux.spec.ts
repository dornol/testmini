import { expect, test } from '../fixtures/auth.fixture';
import AxeBuilder from '@axe-core/playwright';

test.describe.serial('Workflow form recovery and case selection', () => {
	let projectId: number;
	let planId: number;
	let suiteId: number;
	test.afterAll(async ({ request }) => {
		if (projectId) {
			const result = await request.delete(`/api/projects/${projectId}`);
			if (!result.ok()) throw new Error(`Fixture cleanup failed: ${result.status()}`);
		}
	});
	test('prepare isolated large and long-title fixtures', async ({ page }) => {
		const project = await page.request.post('/api/projects', {
			data: { name: `Forms UX ${Date.now()}` }
		});
		expect(project.ok()).toBe(true);
		projectId = (await project.json()).data.id;
		const rows = Array.from({ length: 501 }, (_, i) => ({
			title: i === 0 ? 'Unique needle ' + '긴제목LongTitle'.repeat(12) : `Selection case ${i}`,
			priority: 'MEDIUM'
		}));
		const imported = await page.request.post(`/api/projects/${projectId}/test-cases/import`, {
			multipart: {
				file: {
					name: 'cases.json',
					mimeType: 'application/json',
					buffer: Buffer.from(JSON.stringify(rows))
				}
			}
		});
		expect(imported.ok(), await imported.text()).toBe(true);
		expect((await imported.json()).imported).toBe(501);
		for (const resource of ['test-plans', 'test-suites']) {
			const response = await page.request.post(`/api/projects/${projectId}/${resource}`, {
				data: { name: `Forms ${resource}` }
			});
			expect(response.ok()).toBe(true);
			if (resource === 'test-plans') planId = (await response.json()).id;
			else suiteId = (await response.json()).id;
		}
	});
	test('plan validates linked errors, preserves failed drafts, and retries save', async ({
		page
	}) => {
		await page.goto(`/projects/${projectId}/test-plans/new`);
		await page.waitForLoadState('networkidle');
		await page.locator('#planDesc').fill('Keep this draft');
		await page.locator('#planStartDate').fill('2026-11-20');
		await page.locator('#planEndDate').fill('2026-11-19');
		await page.locator('button[type=submit]').click();
		const summary = page.locator('[data-slot=form-error-summary]');
		await expect(summary).toBeFocused();
		await summary.locator('a[href="#planName"]').click();
		await expect(page.locator('#planName')).toBeFocused();
		await expect(page.locator('#planEndDate')).toHaveAttribute('aria-invalid', 'true');
		await page.locator('#planName').fill('Recoverable plan');
		await page.locator('#planEndDate').fill('2026-11-21');
		let release!: () => void;
		const pending = new Promise<void>((resolve) => {
			release = resolve;
		});
		await page.route(`**/api/projects/${projectId}/test-plans`, async (route) => {
			await pending;
			await route.fulfill({ status: 503, json: { message: 'Unavailable' } });
		});
		await page.locator('button[type=submit]').click();
		await expect(page.locator('button[type=submit]')).toBeDisabled();
		await expect(page.locator('form')).toHaveAttribute('aria-busy', 'true');
		release();
		await expect(summary).toBeFocused();
		await expect(summary).toContainText('저장하지 못했습니다');
		await expect(page.locator('#planDesc')).toHaveValue('Keep this draft');
		await page.unroute(`**/api/projects/${projectId}/test-plans`);
		await page.locator('#planName').press('Enter');
		await page.waitForURL(/\/test-plans\/\d+$/);
		await expect(
			page.getByRole('heading', { name: 'Recoverable plan', exact: true })
		).toBeVisible();
	});
	test('run picker retains hidden selections, clamps virtual scroll, and enforces limit', async ({
		page
	}) => {
		await page.goto(`/projects/${projectId}/test-runs/new`);
		await page.waitForLoadState('networkidle');
		await page.locator('button[type=submit]').click();
		const summary = page.locator('[data-slot=form-error-summary]');
		await expect(summary).toBeFocused();
		await summary.locator('a[href="#run-cases"]').click();
		await expect(page.locator('#run-cases')).toBeFocused();
		const picker = page.locator('#run-cases');
		const bulk = picker.getByRole('checkbox').first();
		const info = picker.getByRole('button', { name: /TC-0001 제목 전체 보기/ });
		await info.click();
		await expect(page.locator('[data-slot=popover-content]')).toContainText(
			'긴제목LongTitle'.repeat(12)
		);
		const popupAxe = await new AxeBuilder({ page })
			.include('[data-slot=popover-content]')
			.withTags(['wcag2a', 'wcag2aa'])
			.analyze();
		expect(
			popupAxe.violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))
		).toEqual([]);

		await page.keyboard.press('Escape');
		await expect(info).toBeFocused();
		await expect(picker.getByRole('checkbox').nth(1)).not.toBeChecked();

		await bulk.check();
		await expect(picker).toContainText('500');
		await page.locator('#name').fill('Selection draft');
		await page.locator('button[type=submit]').click();
		await expect(summary).toContainText('500');
		await bulk.uncheck();
		const list = picker.getByRole('list');
		await list.focus();
		await list.press('PageDown');
		await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
		await list.evaluate((el) => {
			el.scrollTop = el.scrollHeight;
			el.dispatchEvent(new Event('scroll'));
		});
		await expect(picker.getByRole('checkbox').last()).toHaveAccessibleName(/Selection case 500/);
		await page.locator('#run-cases-search').fill('Unique needle');
		await expect(list.getByRole('listitem')).toHaveCount(1);
		await picker.getByRole('checkbox').last().check();
		await page.locator('#run-cases-search').fill('Selection case 4');
		await expect(bulk).not.toBeChecked();
		await page.locator('#run-cases-search').press('Enter');
		await expect(page).toHaveURL(/\/test-runs\/new$/);
		await page.locator('#run-cases-search').fill('No matching cases');
		await expect(picker.getByRole('list')).toHaveCount(0);
		await picker.getByRole('button', { name: '필터 초기화' }).first().click();
		await expect(bulk).toHaveJSProperty('indeterminate', true);
		await expect(picker.getByRole('checkbox').nth(1)).toBeChecked();
		await page.route(`**/projects/${projectId}/test-runs/new`, async (route) => {
			if (route.request().method() === 'POST')
				await route.fulfill({
					status: 503,
					contentType: 'application/json',
					body: JSON.stringify({ type: 'error', status: 503, error: { message: 'Unavailable' } })
				});
			else await route.continue();
		});
		await page.locator('button[type=submit]').click();
		await expect(summary).toContainText('저장하지 못했습니다');
		await expect(page.locator('#name')).toHaveValue('Selection draft');
		await expect(picker.getByRole('checkbox').nth(1)).toBeChecked();
		await page.unroute(`**/projects/${projectId}/test-runs/new`);
		await page.locator('button[type=submit]').click();
		await page.waitForURL(/\/test-runs\/\d+$/);
	});
	test('suite loading can retry and cross-environment errors are actionable', async ({ page }) => {
		await page.goto(`/projects/${projectId}/test-runs/new`);
		await page.waitForLoadState('networkidle');
		await page.locator('#run-cases').getByRole('checkbox').nth(1).check();
		await page.route(`**/api/projects/${projectId}/test-suites/${suiteId}`, (route) =>
			route.fulfill({ status: 503, json: { message: 'Unavailable' } })
		);
		await page.locator('#load-suite').click();
		await page.getByRole('option').filter({ hasText: 'Forms test-suites' }).click();
		const summary = page.locator('[data-slot=form-error-summary]');
		await expect(summary).toBeFocused();
		await expect(page.locator('#run-cases').getByRole('checkbox').nth(1)).toBeChecked();
		await page.unroute(`**/api/projects/${projectId}/test-suites/${suiteId}`);
		await page.getByRole('button', { name: '스위트에서 불러오기', exact: true }).last().click();
		await expect(summary).toHaveCount(0);
		await page.getByRole('button', { name: '크로스 환경 런', exact: true }).click();
		await page.locator('#name').fill('Cross environment draft');
		await page.locator('button[type=submit]').click();
		await expect(summary.locator('a[href="#environment"]')).toBeVisible();
		await summary.locator('a[href="#environment"]').click();
		await expect(page.locator('#environment')).toBeFocused();
		await page.locator('#environment').getByRole('checkbox').nth(1).check();
		const saved = page.waitForResponse(
			(response) =>
				response.url().endsWith('/test-runs/cross-env') && response.request().method() === 'POST'
		);
		await page.locator('button[type=submit]').click();
		const result = await saved;
		expect(result.ok()).toBe(true);
		expect(result.request().postDataJSON().environments).toHaveLength(2);
		expect(result.request().postDataJSON().testCaseIds).toHaveLength(1);
		await page.waitForURL(`**/projects/${projectId}/test-runs`);
	});
	test('add-case dialogs save only selected cases and restore the opener focus', async ({
		page
	}) => {
		for (const [resource, id] of [
			['test-plans', planId],
			['test-suites', suiteId]
		] as const) {
			await page.goto(`/projects/${projectId}/${resource}/${id}`);
			await page.waitForLoadState('networkidle');
			const opener = page.getByRole('button', { name: '케이스 추가', exact: true }).first();
			await opener.click();
			const dialog = page.getByRole('dialog', { name: '케이스 추가', exact: true });
			const info = dialog.getByRole('button', { name: /제목 전체 보기/ }).first();
			await info.click();
			await expect(page.locator('[data-slot=popover-content]')).toBeVisible();
			await page.keyboard.press('Escape');
			await expect(page.locator('[data-slot=popover-content]')).toHaveCount(0);
			await expect(dialog).toBeVisible();
			await expect(info).toBeFocused();
			await dialog.getByRole('checkbox').nth(1).check();
			await dialog.getByRole('button', { name: /케이스 추가/ }).click();
			await expect(dialog).toHaveCount(0);
			await expect(opener).toBeFocused();
			const result = await page.request.get(`/api/projects/${projectId}/${resource}/${id}`);
			expect((await result.json()).items).toHaveLength(1);
			await opener.click();
			await expect(page.getByRole('dialog').getByRole('checkbox').nth(1)).not.toHaveAccessibleName(
				/Unique needle/
			);
			await page.keyboard.press('Escape');
		}
	});
	test('selection-only drafts prompt before leaving', async ({ page }) => {
		await page.goto(`/projects/${projectId}/test-runs/new`);
		await page.waitForLoadState('networkidle');
		await page.locator('#run-cases').getByRole('checkbox').nth(1).check();
		await page.getByRole('link', { name: '취소', exact: true }).click();
		await expect(page.getByRole('alertdialog')).toBeVisible();
	});
	test('cycle creation links date and number errors and preserves the draft on failure', async ({
		page
	}) => {
		for (const theme of ['light', 'dark']) {
			await page.setViewportSize({ width: 375, height: 800 });
			await page.goto(`/projects/${projectId}/test-cycles`);
			await page.waitForLoadState('networkidle');
			const isDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
			if (isDark !== (theme === 'dark')) {
				await page.getByRole('button', { name: /테마 변경|Toggle theme/ }).click();
			}
			const opener = page.locator('[data-slot=page-header]').getByRole('button').first();
			await opener.click();
			const dialog = page.getByRole('dialog');
			const submit = dialog.getByRole('button', { name: '새 사이클', exact: true });
			const summary = dialog.locator('[data-slot=form-error-summary]');
			const name = dialog.locator('#cycle-name');
			const number = dialog.locator('#cycle-number');
			const start = dialog.locator('#cycle-start');
			const end = dialog.locator('#cycle-end');
			const cycleName = `Recovery cycle ${theme}`;
			await name.fill(cycleName);
			await number.fill('1.5');
			await start.fill('2026-11-20');
			await end.fill('2026-11-19');
			await submit.click();
			await expect(summary).toBeFocused();
			await expect(number).toHaveAttribute('aria-invalid', 'true');
			await number.fill(theme === 'light' ? '1' : '2');
			await submit.click();
			await summary.locator('a[href="#cycle-end"]').click();
			await expect(end).toBeFocused();
			expect(await dialog.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
			const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
			expect(
				result.violations
					.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))
					.map((v) => v.id)
			).toEqual([]);
			await page.screenshot({ path: `/tmp/testmini-cycle-error-${theme}.png` });
			await end.fill('2026-11-21');

			const endpoint = `**/api/projects/${projectId}/test-cycles`;
			let releaseResponse!: () => void;
			const pending = new Promise<void>((resolve) => {
				releaseResponse = resolve;
			});
			await page.route(endpoint, async (route) => {
				await pending;
				await route.fulfill({ status: 503, json: { message: 'Unavailable' } });
			});
			await submit.click();
			try {
				await expect(dialog.locator('button[type=submit]')).toBeDisabled();
				await page.keyboard.press('Escape');
				await expect(dialog).toBeVisible();
			} finally {
				releaseResponse();
			}
			await expect(summary).toBeFocused();
			await expect(summary).toContainText('저장하지 못했습니다');
			await expect(name).toHaveValue(cycleName);
			await expect(end).toHaveValue('2026-11-21');
			await page.unroute(endpoint);

			await name.press('Enter');
			await expect(dialog).toHaveCount(0);
			await expect(opener).toBeFocused();
			await expect(
				page.getByText(`#${theme === 'light' ? 1 : 2} ${cycleName}`, { exact: true })
			).toBeVisible();
		}
	});

	for (const resource of ['releases', 'exploratory'] as const) {
		test(`${resource} creation validates fields and retries without losing input`, async ({
			page
		}, testInfo) => {
			await page.setViewportSize({ width: 375, height: 800 });
			await page.goto(`/projects/${projectId}/${resource}`);
			await page.waitForLoadState('networkidle');
			const exploratory = resource === 'exploratory';
			if (
				exploratory &&
				!(await page.locator('html').evaluate((el) => el.classList.contains('dark')))
			) {
				await page.getByRole('button', { name: '테마 변경' }).click();
			}
			await page.locator('[data-slot=page-header]').getByRole('button').first().click();
			const dialog = page.getByRole('dialog');
			const submit = dialog.locator('button[type=submit]');
			const summary = dialog.locator('[data-slot=form-error-summary]');
			const primaryId = exploratory ? 'session-title' : 'relName';
			const secondaryId = exploratory ? 'session-tags' : 'relVersion';
			const primary = dialog.locator(`#${primaryId}`);
			const secondary = dialog.locator(`#${secondaryId}`);
			const description = dialog.getByRole('textbox').and(dialog.locator('textarea'));
			const longValue = 'x'.repeat(101);
			await secondary.fill(longValue);
			await submit.click();
			await expect(summary).toBeFocused();
			await expect(primary).toHaveAttribute('aria-invalid', 'true');
			await summary.locator(`a[href="#${secondaryId}"]`).click();
			await expect(secondary).toBeFocused();
			await expect(secondary).toHaveAttribute('aria-invalid', 'true');
			expect(await dialog.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
			const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
			expect(
				axe.violations
					.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))
					.map((v) => v.id)
			).toEqual([]);
			await testInfo.attach(`${resource}-error`, {
				body: await page.screenshot({ path: `/tmp/testmini-${resource}-create-error.png` }),
				contentType: 'image/png'
			});

			const title = `Recovered ${resource}`;
			await primary.fill(title);
			await secondary.fill(exploratory ? ' smoke, , ui ' : 'v1.0');
			await description.fill('Line one\nLine two');
			const endpoint = `**/api/projects/${projectId}/${exploratory ? 'exploratory-sessions' : resource}`;
			let releaseResponse!: () => void;
			const pending = new Promise<void>((resolve) => {
				releaseResponse = resolve;
			});
			await page.route(endpoint, async (route) => {
				await pending;
				await route.fulfill({ status: 503, json: { message: 'Unavailable' } });
			});
			await submit.click();
			try {
				await expect(submit).toBeDisabled();
				await page.keyboard.press('Escape');
				await expect(dialog).toBeVisible();
			} finally {
				releaseResponse();
			}
			await expect(summary).toBeFocused();
			await expect(summary).toContainText('저장하지 못했습니다');
			await expect(primary).toHaveValue(title);
			await expect(description).toHaveValue('Line one\nLine two');
			await page.unroute(endpoint);
			const saved = page.waitForResponse(
				(res) =>
					res.url().endsWith(exploratory ? '/exploratory-sessions' : '/releases') &&
					res.request().method() === 'POST'
			);
			await primary.press('Enter');
			const response = await saved;
			expect(response.ok()).toBe(true);
			const data = await response.json();
			if (exploratory) expect(data.tags).toEqual(['smoke', 'ui']);
			await expect(page).toHaveURL(new RegExp(`/${resource}/${data.id}$`));
		});
	}

	for (const locale of ['ko', 'en'])
		for (const theme of ['light', 'dark'])
			for (const width of [375, 768, 1440]) {
				test(`${locale}/${theme}/${width}: forms and add-case dialogs`, async ({
					page
				}, testInfo) => {
					test.setTimeout(90000);
					await page.setViewportSize({ width, height: 1000 });
					await page.goto(`/projects/${projectId}/test-plans/new`);
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
					for (const path of [
						'test-plans/new',
						'test-runs/new',
						`test-plans/${planId}`,
						`test-suites/${suiteId}`
					]) {
						await page.goto(`/projects/${projectId}/${path}`);
						await page.waitForLoadState('networkidle');
						if (!path.endsWith('/new')) {
							await page
								.getByRole('button', { name: /케이스 추가|Add Cases/i })
								.first()
								.click();
							await expect(page.getByRole('dialog')).toBeVisible();
						}
						expect(
							await page.locator('main').evaluate((el) => el.scrollWidth > el.clientWidth),
							path
						).toBe(false);
						if (!path.endsWith('/new'))
							expect(
								await page.getByRole('dialog').evaluate((el) => el.scrollWidth > el.clientWidth),
								path
							).toBe(false);
						const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
						expect
							.soft(
								result.violations
									.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))
									.map((v) => ({
										id: v.id,
										nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary }))
									})),
								path
							)
							.toEqual([]);
						if (width === 375 && locale === 'ko')
							await testInfo.attach(path.replaceAll('/', '-'), {
								body: await page.screenshot({
									fullPage: true,
									path: `/tmp/testmini-form-${theme}-${path.replaceAll('/', '-')}.png`
								}),
								contentType: 'image/png'
							});
						if (!path.endsWith('/new')) await page.keyboard.press('Escape');
					}
				});
			}
});
