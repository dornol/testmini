import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures/auth.fixture';

test.describe.serial('Project list', () => {
	const prefix = `Projects UX ${Date.now()}`;
	const longName = prefix + ' ' + 'longidentifier'.repeat(5);
	const shortName = prefix + ' Active second';
	const inactiveName = prefix + ' Inactive';
	const projectIds: number[] = [];
	let archivedId: number;
	const filtered = (extra: Record<string, string> = {}) =>
		'/projects?' + new URLSearchParams({ search: prefix, ...extra });

	test.afterAll(async ({ request }) => {
		for (const id of projectIds)
			if (id !== archivedId) expect((await request.delete(`/api/projects/${id}`)).ok()).toBe(true);
	});

	test('creates two active projects and an inactive project for list states', async ({
		request
	}) => {
		for (const name of [shortName, longName, inactiveName]) {
			const response = await request.post('/api/projects', {
				data: { name, description: 'Project description ' + 'longidentifier'.repeat(15) }
			});
			expect(response.ok()).toBe(true);
			projectIds.push((await response.json()).data.id);
		}
		archivedId = projectIds[2];
		expect((await request.delete(`/api/projects/${archivedId}`)).ok()).toBe(true);
	});

	test('search and status stay together through navigation and empty results', async ({ page }) => {
		await page.goto(filtered({ limit: '1' }));
		await page.waitForLoadState('networkidle');
		const input = page.getByRole('searchbox');
		const results = page.getByRole('region', { name: '검색 결과' });
		const status = page.getByRole('navigation', { name: '프로젝트 상태' });
		const inactive = status.getByRole('link', { name: '비활성', exact: true });
		await expect(results.getByRole('status')).toHaveText('프로젝트 2개');
		await input.fill(inactiveName);
		await inactive.press('Enter');
		await expect(page).toHaveURL(/active=false/);
		await expect(results.getByRole('heading', { name: inactiveName })).toBeVisible();
		await expect(results.getByRole('link', { name: inactiveName, exact: true })).toHaveCount(0);
		await expect(results.getByRole('link', { name: '비활성 프로젝트 관리' })).toHaveAttribute(
			'href',
			/\/admin\/projects\?inactive=true/
		);
		await expect(inactive).toHaveAttribute('aria-current', 'page');

		await page.goBack();
		await expect(input).toHaveValue(prefix);
		await expect(results.getByRole('status')).toHaveText('프로젝트 2개');
		await page.goForward();
		await expect(input).toHaveValue(inactiveName);
		await expect(results.getByRole('status')).toHaveText('프로젝트 1개');

		await input.fill(prefix + ' missing');
		await input.press('Enter');
		await expect(
			results.getByText('검색 조건에 맞는 프로젝트가 없습니다.', { exact: false })
		).toBeVisible();
		await expect(results.getByRole('status')).toHaveText('프로젝트 0개');
		await page.getByRole('link', { name: '검색어 지우기' }).press('Enter');
		await expect(input).toBeFocused();
		await expect(input).toHaveValue('');
		await expect(inactive).toHaveAttribute('aria-current', 'page');
	});

	test('repairs invalid pages and keeps the search on keyboard pagination', async ({ page }) => {
		await page.goto(filtered({ limit: '1', page: '99' }));
		await expect(page).toHaveURL(/page=2/);
		const results = page.getByRole('region', { name: '검색 결과' });
		const pagination = results.getByRole('navigation', { name: '프로젝트 페이지 이동' });
		await expect(pagination.getByText('2 / 2')).toBeVisible();
		await expect(results.getByRole('link', { name: shortName })).toBeVisible();
		await pagination.getByRole('link', { name: '이전' }).press('Enter');
		await expect(results.getByRole('link', { name: longName })).toBeVisible();
		await expect(pagination.getByText('1 / 2')).toBeVisible();
		await expect(page.getByRole('searchbox')).toHaveValue(prefix);
		await pagination.getByRole('link', { name: '다음' }).press('Enter');
		await expect(page).toHaveURL(/page=2/);
		await expect(page.getByRole('searchbox')).toHaveValue(prefix);
	});

	test('keeps the project results visible while live search loads', async ({ page }) => {
		await page.goto(filtered());
		await page.waitForLoadState('networkidle');
		const results = page.getByRole('region', { name: '검색 결과' });
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		await page.route(/\/projects\/__data\.json(?:\?|$)/, async (route) => {
			await gate;
			await route.continue();
		});
		await page.getByRole('searchbox').fill(shortName);
		try {
			await expect(results.locator('[aria-busy=true]')).toBeVisible();
			await expect(results.getByRole('link', { name: longName })).toBeVisible();
		} finally {
			release();
		}
		await expect(results.getByRole('status')).toHaveText('프로젝트 1개');
		await expect(results.getByRole('link', { name: longName })).toHaveCount(0);
		await expect(results.getByRole('link', { name: shortName })).toBeVisible();
		await expect(page.getByRole('searchbox')).toBeFocused();
	});

	for (const locale of ['ko', 'en'])
		for (const theme of ['light', 'dark'])
			for (const width of [375, 768, 1440]) {
				test(`${locale}/${theme}/${width}: projects are readable and open by keyboard`, async ({
					page
				}, testInfo) => {
					await page.setViewportSize({ width, height: 850 });
					await page.goto(filtered({ limit: '1' }));
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
					expect(await main.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
					const item = main.getByRole('link', { name: longName, exact: true });
					await expect(item).toBeVisible();
					const audit = await new AxeBuilder({ page })
						.include('main')
						.withTags(['wcag2a', 'wcag2aa'])
						.analyze();
					expect(
						audit.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
					).toEqual([]);
					if (locale === 'ko' && width === 375) {
						await testInfo.attach('project-list', {
							body: await page.screenshot({ path: `/tmp/testmini-project-list-${theme}.png` }),
							contentType: 'image/png'
						});
					}
					await item.press('Enter');
					await expect(page).toHaveURL(new RegExp(`/projects/${projectIds[1]}$`));
				});
			}
});
