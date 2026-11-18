import { test, expect } from '../fixtures/auth.fixture';
import AxeBuilder from '@axe-core/playwright';

test.describe.serial('Suite form dialog UX', () => {
	let projectId: number;
	let suiteId: number;
	test.afterAll(async ({ request }) => {
		if (projectId) await request.delete(`/api/projects/${projectId}`);
	});
	test('prepare isolated suite', async ({ page }) => {
		const response = await page.request.post('/api/projects', {
			data: { name: `Suite forms ${Date.now()}` }
		});
		expect(response.ok()).toBe(true);
		projectId = (await response.json()).data.id;
		const suite = await page.request.post(`/api/projects/${projectId}/test-suites`, {
			data: { name: 'Suite editing fixture', description: 'Original description' }
		});
		expect(suite.ok()).toBe(true);
		suiteId = (await suite.json()).id;
	});
	test('create supports required/length errors, pending, recovery, Enter, and focus restore', async ({
		page
	}) => {
		await page.goto(`/projects/${projectId}/test-suites`);
		await page.waitForLoadState('networkidle');
		const opener = page.locator('[data-slot=page-header]').getByRole('button').first();
		await opener.click();
		const dialog = page.getByRole('dialog');
		const submit = dialog.locator('button[type=submit]');
		await submit.click();
		const summary = dialog.locator('[data-slot=form-error-summary]');
		await expect(summary).toBeFocused();
		await summary.locator('a[href="#suiteName"]').click();
		await expect(page.locator('#suiteName')).toBeFocused();
		await page.locator('#suiteName').fill('Recoverable suite');
		await page.locator('#suiteDesc').fill('x'.repeat(1001));
		await submit.click();
		await expect(page.locator('#suiteDesc')).toHaveAttribute('aria-invalid', 'true');
		await expect(summary).toContainText('1000');
		await page.locator('#suiteDesc').fill('Preserve this description');
		let release!: () => void;
		const pending = new Promise<void>((resolve) => (release = resolve));
		await page.route(`**/api/projects/${projectId}/test-suites`, async (route) => {
			await pending;
			await route.fulfill({ status: 503, json: { message: 'Unavailable' } });
		});
		await submit.click();
		await expect(submit).toBeDisabled();
		await expect(dialog.locator('form')).toHaveAttribute('aria-busy', 'true');
		await page.keyboard.press('Escape');
		await expect(dialog).toBeVisible();
		await expect(dialog.locator('[data-dialog-close]')).toHaveCount(0);
		await page.mouse.click(5, 5);
		await expect(dialog).toBeVisible();
		release();
		await expect(summary).toBeFocused();
		await expect(summary).toContainText('저장하지 못했습니다');
		await expect(page.locator('#suiteName')).toHaveValue('Recoverable suite');
		await expect(page.locator('#suiteDesc')).toHaveValue('Preserve this description');
		await page.unroute(`**/api/projects/${projectId}/test-suites`);
		await page.locator('#suiteName').press('Enter');
		await expect(dialog).toHaveCount(0);
		await expect(opener).toBeFocused();
		await expect(page.getByRole('link', { name: 'Recoverable suite', exact: true })).toBeVisible();
	});
	test('list and detail editors use the same validation and preserve failed edits', async ({
		page
	}) => {
		await page.goto(`/projects/${projectId}/test-suites`);
		await page.waitForLoadState('networkidle');
		const row = page
			.getByRole('row')
			.filter({ has: page.getByRole('link', { name: 'Suite editing fixture', exact: true }) });
		await row.getByRole('button').last().click();
		await page.getByRole('menuitem', { name: '수정', exact: true }).click();
		await expect(page.locator('#editSuiteName')).toHaveValue('Suite editing fixture');
		await page.locator('#editSuiteName').fill('List edited suite');
		await page.locator('#editSuiteName').press('Enter');
		await expect(page.getByRole('dialog')).toHaveCount(0);
		await page.getByRole('link', { name: 'List edited suite', exact: true }).click();
		await page.waitForLoadState('networkidle');
		const opener = page.getByRole('button', { name: '수정', exact: true });
		await opener.click();
		const dialog = page.getByRole('dialog');
		const summary = dialog.locator('[data-slot=form-error-summary]');
		await page.locator('#editSuiteName').fill('');
		await dialog.locator('button[type=submit]').click();
		await expect(summary).toBeFocused();
		await page.locator('#editSuiteName').fill('Detail edited suite');
		await page.locator('#editSuiteDesc').fill('');
		await page.route(`**/api/projects/${projectId}/test-suites/${suiteId}`, (route) =>
			route.fulfill({ status: 503, json: { message: 'Unavailable' } })
		);
		await dialog.locator('button[type=submit]').click();
		await expect(summary).toContainText('저장하지 못했습니다');
		await expect(page.locator('#editSuiteName')).toHaveValue('Detail edited suite');
		await page.unroute(`**/api/projects/${projectId}/test-suites/${suiteId}`);
		await page.locator('#editSuiteName').press('Enter');
		await expect(dialog).toHaveCount(0);
		await expect(opener).toBeFocused();
		await expect(
			page.getByRole('heading', { name: 'Detail edited suite', exact: true })
		).toBeVisible();
		const result = await page.request.get(`/api/projects/${projectId}/test-suites/${suiteId}`);
		expect((await result.json()).description).toBeNull();
	});
	for (const locale of ['ko', 'en'])
		for (const theme of ['light', 'dark'])
			for (const width of [375, 768, 1440])
				test(`${locale}/${theme}/${width}: create and invalid edit dialogs`, async ({ page }) => {
					test.setTimeout(60000);
					await page.setViewportSize({ width, height: 800 });
					await page.goto(`/projects/${projectId}/test-suites`);
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
					for (const mode of ['create', 'edit']) {
						if (mode === 'create')
							await page.locator('[data-slot=page-header]').getByRole('button').first().click();
						else {
							await page.goto(`/projects/${projectId}/test-suites/${suiteId}`);
							await page.waitForLoadState('networkidle');
							await page.getByRole('button', { name: /^수정$|^Edit$/ }).click();
							await page.locator('#editSuiteName').fill('');
							await page.locator('button[type=submit]').click();
						}
						const dialog = page.getByRole('dialog');
						await expect(dialog).toBeVisible();
						expect(await dialog.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
						const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
						expect
							.soft(
								result.violations
									.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
									.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.failureSummary) }))
							)
							.toEqual([]);
						if (width === 375 && locale === 'ko')
							await page.screenshot({ path: `/tmp/testmini-suite-${mode}-${theme}.png` });
						await page.keyboard.press('Escape');
						await expect(dialog).toHaveCount(0);
					}
				});
});
