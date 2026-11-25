import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures/auth.fixture';

/**
 * Error pages for missing and malformed ids.
 *
 * Every detail route answers 404 for an unknown id and 400 for a malformed one. The page
 * must say so in the user's language (the server messages are English), offer a way home,
 * and stay free of overflow and serious a11y problems.
 */
test.describe.serial('Error pages for missing and malformed ids', () => {
	let projectId: number;
	const details = [
		'releases',
		'test-plans',
		'test-suites',
		'exploratory',
		'test-runs',
		'test-cases'
	];
	const cases = () => [
		{ url: '/projects/999999999', status: 404 },
		{ url: '/projects/abc', status: 400 },
		{ url: `/projects/${projectId}/no-such-page`, status: 404 },
		{ url: '/teams/999999999', status: 404 },
		{ url: '/teams/abc', status: 400 },
		...details.flatMap((d) => [
			{ url: `/projects/${projectId}/${d}/999999999`, status: 404 },
			{ url: `/projects/${projectId}/${d}/abc`, status: 400 }
		])
	];

	test.beforeAll(async ({ request }) => {
		const project = await request.post('/api/projects', {
			data: { name: `Errors ${Date.now()}` }
		});
		expect(project.ok()).toBe(true);
		projectId = (await project.json()).data.id;
	});

	test.afterAll(async ({ request }) => {
		if (projectId) expect((await request.delete(`/api/projects/${projectId}`)).ok()).toBe(true);
	});

	test('every route answers with its status and a Korean message', async ({ page }) => {
		for (const { url, status } of cases()) {
			const response = await page.goto(url);
			expect(response?.status(), url).toBe(status);
			const main = page.getByRole('main');
			await expect(main.getByRole('heading', { level: 1 }), url).toHaveText(String(status));
			// The server's English text ("Release not found", "Invalid plan ID") must not leak.
			const text = (await main.innerText()).replace(/\s+/g, ' ');
			expect(text, url).toMatch(status === 404 ? /찾을 수 없습니다/ : /잘못된 요청/);
			expect(text, url).not.toMatch(/not found|Invalid|unexpected error/i);
			await expect(main.getByRole('link', { name: '홈으로' }), url).toBeVisible();
		}
	});

	for (const width of [375, 1440])
		test(`${width}px: the error page has no overflow or serious a11y problem`, async ({ page }) => {
			await page.setViewportSize({ width, height: 850 });
			for (const url of [`/projects/${projectId}/releases/999999999`, '/projects/abc']) {
				await page.goto(url);
				const main = page.getByRole('main');
				await expect(main.getByRole('heading', { level: 1 })).toBeVisible();
				expect(await main.evaluate((el) => el.scrollWidth > el.clientWidth), url).toBe(false);
				const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
				expect(
					audit.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')),
					url
				).toEqual([]);
			}
		});

	test('the message follows the language', async ({ page }) => {
		// A click before hydration finishes is ignored, so retry until the menu is open.
		const openLanguageMenu = async (button: string, item: string) => {
			await expect(async () => {
				if (!(await page.getByRole('menuitem', { name: item }).isVisible()))
					await page.getByRole('button', { name: button }).click();
				await expect(page.getByRole('menuitem', { name: item })).toBeVisible({ timeout: 1000 });
			}).toPass({ timeout: 10000 });
			await page.getByRole('menuitem', { name: item }).click();
		};
		await page.goto(`/projects/${projectId}/releases/999999999`);
		await openLanguageMenu('언어 변경', 'English');
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
		const main = page.getByRole('main');
		await expect(main).toContainText('We could not find what you asked for');
		await expect(main.getByRole('link', { name: 'Go home' })).toBeVisible();
		// Restore the default so later tests start in Korean.
		await openLanguageMenu('Change language', '한국어');
		await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
	});
});
