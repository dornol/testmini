import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../fixtures/auth.fixture';

test('project creation restores keyboard focus and preserves the draft after a failed request', async ({
	page,
	request
}) => {
	const name = `Recoverable project ${Date.now()}`;
	await page.setViewportSize({ width: 375, height: 850 });
	await page.goto('/projects/new');
	await page.waitForLoadState('networkidle');
	const input = page.locator('#name');
	const description = page.locator('#description');
	const summary = page.locator('[data-slot=form-error-summary]');
	await expect(input).toHaveAttribute('maxlength', '100');
	await expect(description).toHaveAttribute('maxlength', '1000');
	await input.fill('   ');
	await description.fill('Keep this description during validation and retry.');
	await description.press('Tab');
	await page.getByRole('button', { name: '프로젝트 만들기' }).press('Enter');
	await expect(summary).toBeFocused();
	await expect(input).toHaveAttribute('aria-invalid', 'true');
	await summary.getByRole('link').press('Enter');
	await expect(input).toBeFocused();
	await expect(description).toHaveValue('Keep this description during validation and retry.');

	await input.fill(name);
	const submit = /\/projects\/new(?:\?|$)/;
	await page.route(submit, (route) =>
		route.request().method() === 'POST'
			? route.fulfill({
					status: 503,
					json: { type: 'error', status: 503, error: { message: 'Unavailable' } }
				})
			: route.continue()
	);
	await input.press('Enter');
	await expect(summary).toBeFocused();
	await expect(summary).toContainText('저장하지 못했습니다');
	await expect(input).toHaveValue(name);
	await expect(description).toHaveValue('Keep this description during validation and retry.');
	await page.unroute(submit);
	await input.press('Enter');
	await expect(page).toHaveURL(/\/projects\/\d+$/);
	const path = new URL(page.url()).pathname;
	try {
		await expect(page.getByRole('heading', { name, exact: true, level: 1 })).toBeVisible();
	} finally {
		expect((await request.delete('/api' + path)).ok()).toBe(true);
	}
});

test('server validation shows the error and keeps the description with JavaScript off', async ({
	browser,
	page,
	baseURL
}) => {
	const client = await browser.newContext({
		baseURL,
		javaScriptEnabled: false,
		storageState: await page.context().storageState()
	});
	try {
		const native = await client.newPage();
		await native.goto('/projects/new');
		await native.locator('#description').fill('Keep this draft after a native submission.');
		await native.getByRole('button', { name: '프로젝트 만들기' }).click();
		await expect(native.locator('[data-slot=form-error-summary]').getByRole('link')).toHaveText(
			'프로젝트 이름을 입력하세요.'
		);
		await expect(native.locator('#description')).toHaveValue(
			'Keep this draft after a native submission.'
		);
	} finally {
		await client.close();
	}
});

for (const locale of ['ko', 'en'])
	for (const theme of ['light', 'dark'])
		for (const width of [375, 768, 1440]) {
			test(`${locale}/${theme}/${width}: the creation form and errors are readable`, async ({
				page
			}, testInfo) => {
				await page.setViewportSize({ width, height: 850 });
				await page.goto('/projects/new');
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
				await expect(
					main.getByRole('heading', { name: /새 프로젝트|New Project/, level: 1 })
				).toBeVisible();
				await main.getByRole('button', { name: /프로젝트 만들기|Create Project/ }).press('Enter');
				const summary = main.locator('[data-slot=form-error-summary]');
				await expect(summary).toBeFocused();
				await expect(main.locator('#name')).toHaveAttribute('aria-describedby', 'name-error');
				expect(await main.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
				const audit = await new AxeBuilder({ page })
					.include('main')
					.withTags(['wcag2a', 'wcag2aa'])
					.analyze();
				expect(
					audit.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
				).toEqual([]);
				if (locale === 'ko' && width === 375)
					await testInfo.attach('project-create-form', {
						body: await page.screenshot({ path: `/tmp/testmini-project-create-${theme}.png` }),
						contentType: 'image/png'
					});
			});
		}
