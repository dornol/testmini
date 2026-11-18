import { expect, test } from '../fixtures/auth.fixture';
import AxeBuilder from '@axe-core/playwright';

test.describe('My Work', () => {
	test('loads from global navigation with summary and filters', async ({ page }) => {
		await page.goto('/my-work');
		await page.waitForLoadState('networkidle');

		await expect(page.getByRole('heading', { level: 1, name: /내 업무|My Work/ })).toBeVisible();
		await expect(
			page
				.getByRole('navigation', { name: /주요 탐색|Main navigation/ })
				.getByRole('link', { name: /내 업무|My Work/ })
		).toBeVisible();
		await expect(page.getByRole('link', { name: /전체 업무|All work/ })).toHaveAttribute(
			'aria-current',
			'page'
		);
		await expect(page.getByRole('combobox', { name: /^프로젝트$|^Project$/ })).toBeVisible();
		await expect(page.getByRole('combobox', { name: /^우선순위$|^Priority$/ })).toBeVisible();
	});

	test('keeps type and priority filters in the URL', async ({ page }) => {
		await page.goto('/my-work');
		await page.getByRole('link', { name: /재검증|Retests/ }).click();
		await expect(page.getByRole('link', { name: /재검증|Retests/ })).toHaveAttribute(
			'aria-current',
			'page'
		);
		await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
		await page.getByRole('combobox', { name: /^우선순위$|^Priority$/ }).selectOption('HIGH');
		await page.getByRole('button', { name: /필터 적용|Apply filters/ }).click();
		await expect(page).toHaveURL(/priority=HIGH/);

		expect(page.url()).toContain('type=RETEST');
		await expect(page.getByRole('link', { name: /재검증|Retests/ })).toHaveAttribute(
			'aria-current',
			'page'
		);
		await expect(page.getByRole('link', { name: /필터 초기화|Clear filters/ })).toBeVisible();
	});

	test('retries an unavailable results request on the same URL', async ({ page }) => {
		await page.goto('/my-work');
		await page.waitForLoadState('networkidle');
		const dataRequest = /\/my-work\/__data\.json(?:\?|$)/;
		await page.route(dataRequest, async (route) => {
			const response = await route.fetch();
			const body = JSON.parse((await response.text()).trim().split('\n')[0]);
			body.nodes[body.nodes.length - 1] = {
				type: 'error',
				status: 500,
				error: { message: 'Internal Error' }
			};
			await route.fulfill({ response, body: JSON.stringify(body) + '\n' });
		});
		await page.getByRole('link', { name: /재검증|Retests/ }).press('Enter');
		await expect(
			page.getByRole('heading', { name: '내 업무를 불러오지 못했습니다' })
		).toBeVisible();
		await expect(page).toHaveURL(/type=RETEST/);
		await page.unroute(dataRequest);
		await page.getByRole('button', { name: '다시 시도' }).press('Enter');
		await expect(page.getByRole('region', { name: '검색 결과' })).toBeVisible();
		await expect(page).toHaveURL(/type=RETEST/);
	});

	test('has no serious accessibility violations', async ({ page }) => {
		await page.goto('/my-work');
		await page.waitForLoadState('networkidle');
		const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
		const seriousOrCritical = results.violations.filter(
			(violation) => violation.impact === 'serious' || violation.impact === 'critical'
		);
		expect(seriousOrCritical).toHaveLength(0);
	});

	test('does not overflow on a mobile viewport', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/my-work');
		await page.waitForLoadState('networkidle');
		const dimensions = await page.locator('body').evaluate((body) => ({
			scrollWidth: body.scrollWidth,
			clientWidth: body.clientWidth
		}));
		expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
	});
});

test.describe.serial('Assigned work filters', () => {
	let projectId: number;
	let casePath: string;
	const projectName = 'My Work ' + 'longidentifier'.repeat(5);
	const caseTitle = 'Assigned work ' + 'longidentifier'.repeat(8);
	const filteredPath = () => `/my-work?type=ASSIGNED&project=${projectId}`;

	test.afterAll(async ({ request }) => {
		if (projectId) expect((await request.delete(`/api/projects/${projectId}`)).ok()).toBe(true);
	});

	test('creates an assigned case for filtered views', async ({ page, request, baseURL }) => {
		const project = await request.post('/api/projects', { data: { name: projectName } });
		expect(project.ok()).toBe(true);
		projectId = (await project.json()).data.id;
		const session = await request.get('/api/auth/get-session');
		expect(session.ok()).toBe(true);
		const userId = (await session.json()).user.id;
		await page.goto(`/projects/${projectId}/test-cases/new`);
		await page.waitForLoadState('networkidle');
		await page.locator('#title').fill(caseTitle);
		await page.locator('button[type=submit]').click();
		await page.waitForURL(/test-cases\/\d+$/);
		casePath = new URL(page.url()).pathname;
		const assignment = await request.post(casePath + '?/assignAssignee', {
			form: { userId },
			headers: { origin: baseURL!, accept: 'application/json', 'x-sveltekit-action': 'true' }
		});
		expect(assignment.ok()).toBe(true);
		expect((await assignment.json()).type).toBe('success');
	});

	test('applies a filter with the keyboard and restores applied selections through history', async ({
		page
	}) => {
		await page.goto(filteredPath());
		await page.waitForLoadState('networkidle');
		const main = page.getByRole('main');
		const results = main.getByRole('region', { name: '검색 결과' });
		const project = main.getByRole('combobox', { name: '프로젝트' });
		const priority = main.getByRole('combobox', { name: '우선순위' });
		const apply = main.getByRole('button', { name: '필터 적용' });
		const item = results.getByRole('link', { name: new RegExp(caseTitle) });
		await expect(project).toHaveValue(String(projectId));
		await expect(results.getByRole('status')).toHaveText('업무 1건');
		await expect(item).toHaveAttribute('href', casePath);

		await priority.selectOption('HIGH');
		const dataRequest = /\/my-work\/__data\.json(?:\?|$)/;
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		await page.route(dataRequest, async (route) => {
			await gate;
			await route.continue();
		});
		try {
			await apply.press('Enter');
			await expect(results.getByRole('status')).toHaveText('내 업무 불러오는 중');
			await expect(item).toBeVisible();
			await expect(apply).toBeFocused();
		} finally {
			release();
		}
		await expect(page).toHaveURL(/priority=HIGH/);
		await expect(results.getByRole('status')).toHaveText('업무 0건');
		await expect(results.getByText('현재 필터와 일치하는 업무가 없습니다.')).toBeVisible();
		await expect(apply).toBeFocused();
		await page.unroute(dataRequest);
		await page.goBack();
		await expect(priority).toHaveValue('');
		await expect(item).toBeVisible();
		await page.goForward();
		await expect(priority).toHaveValue('HIGH');
		await expect(item).toHaveCount(0);

		await main.getByRole('link', { name: '필터 초기화' }).press('Enter');
		await expect(page).toHaveURL(/\/my-work$/);
		await expect(project).toBeFocused();
		await expect(project).toHaveValue('');
		await expect(priority).toHaveValue('');
	});

	test('an unavailable project keeps its filter visible until it is cleared', async ({ page }) => {
		await page.goto('/my-work?project=2147483647');
		const project = page.getByRole('combobox', { name: '프로젝트' });
		await expect(project).toHaveValue('2147483647');
		await expect(project.getByRole('option', { name: '선택할 수 없는 프로젝트' })).toBeAttached();
		await expect(page.getByText('현재 필터와 일치하는 업무가 없습니다.')).toBeVisible();
	});

	for (const locale of ['ko', 'en'])
		for (const theme of ['light', 'dark'])
			for (const width of [375, 768, 1440]) {
				test(`${locale}/${theme}/${width}: assigned work, filter alignment, and keyboard navigation`, async ({
					page
				}, testInfo) => {
					await page.setViewportSize({ width, height: 850 });
					await page.goto(filteredPath());
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
					const filters = main.locator('[data-slot=filter-toolbar]');
					const geometry = await filters
						.locator('select, button[type=submit]')
						.evaluateAll((elements) =>
							elements.map((element) => {
								const rect = element.getBoundingClientRect();
								return { height: rect.height, bottom: rect.bottom };
							})
						);
					expect(geometry.map(({ height }) => height)).toEqual([40, 40, 40]);
					if (width >= 768) expect(new Set(geometry.map(({ bottom }) => bottom)).size).toBe(1);
					const { scroll, client } = await main.evaluate((el) => ({
						scroll: el.scrollWidth,
						client: el.clientWidth
					}));
					expect(scroll).toBeLessThanOrEqual(client);
					const item = main.getByRole('link', { name: new RegExp(caseTitle) });
					await expect(item).toHaveAccessibleDescription(new RegExp(projectName));
					await expect(
						main.getByRole('link', { name: /할당 케이스|Assigned cases/ })
					).toHaveAttribute('aria-current', 'page');
					const audit = await new AxeBuilder({ page })
						.include('main')
						.withTags(['wcag2a', 'wcag2aa'])
						.analyze();
					expect(
						audit.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
					).toEqual([]);
					if (locale === 'ko' && width === 375)
						await testInfo.attach('my-work', {
							body: await main.screenshot({ path: `/tmp/testmini-my-work-${theme}.png` }),
							contentType: 'image/png'
						});
					await item.press('Enter');
					await expect(page).toHaveURL(new RegExp(casePath + '$'));
				});
			}
});
