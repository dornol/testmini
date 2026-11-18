import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures/auth.fixture';

test.describe.serial('Traceability', () => {
	let projectId: number;
	let requirementId: number;
	let alternateId: number;
	let firstId: number;
	const firstTitle = 'Linked case ' + 'longidentifier'.repeat(8);
	const secondTitle = 'Available traceability case';
	const requirementTitle = 'Requirement ' + 'longidentifier'.repeat(8);
	const alternateTitle = 'Other requirement';
	const endpoint = () => `/api/projects/${projectId}/requirements`;
	const url = () => `/projects/${projectId}/traceability`;

	test.afterAll(async ({ request }) => {
		if (projectId) expect((await request.delete(`/api/projects/${projectId}`)).ok()).toBe(true);
	});

	test('requirement list retries before showing a real empty state', async ({ page, request }) => {
		const project = await request.post('/api/projects', {
			data: { name: `Traceability ${Date.now()}` }
		});
		expect(project.ok()).toBe(true);
		projectId = (await project.json()).data.id;
		await page.route('**' + endpoint(), (route) =>
			route.fulfill({ status: 503, json: { message: 'Unavailable' } })
		);
		await page.goto(url());
		await expect(page.getByRole('alert')).toHaveText('요구사항을 불러오지 못했습니다');
		await expect(page.getByText('아직 요구사항이 없습니다', { exact: true })).toHaveCount(0);
		await page.unroute('**' + endpoint());
		await page.getByRole('button', { name: '다시 시도' }).press('Enter');
		await expect(page.getByText('아직 요구사항이 없습니다', { exact: true })).toBeVisible();

		for (const title of [firstTitle, secondTitle]) {
			await page.goto(`/projects/${projectId}/test-cases/new`);
			await page.waitForLoadState('networkidle');
			await page.locator('#title').fill(title);
			await page.locator('button[type=submit]').click();
			await page.waitForURL(/test-cases\/\d+$/);
			if (title === firstTitle) firstId = Number(new URL(page.url()).pathname.split('/').at(-1));
		}
		for (const title of [requirementTitle, alternateTitle]) {
			const result = await request.post(endpoint(), {
				data: {
					title,
					externalId: title === requirementTitle ? 'TRACE-101' : 'TRACE-102',
					source: 'Product specification'
				}
			});
			expect(result.status()).toBe(201);
			const { id } = await result.json();
			if (title === requirementTitle) requirementId = id;
			else alternateId = id;
		}
		const link = await request.post(`${endpoint()}/${requirementId}/test-cases`, {
			data: { testCaseIds: [firstId] }
		});
		expect(link.ok()).toBe(true);
	});

	test('matrix retry and targeted linking work independently of the expanded row', async ({
		page,
		request
	}) => {
		await page.setViewportSize({ width: 375, height: 850 });
		await page.goto(url());
		const table = page.getByRole('table', { name: '요구사항' });
		const toggle = table.getByRole('button', { name: new RegExp('TRACE-101') });
		const matrix = '**' + endpoint() + '/matrix';
		await page.route(matrix, (route) => route.fulfill({ status: 503, json: {} }));
		await toggle.press('Enter');
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
		const linked = table.locator(`#requirement-links-${requirementId}`);
		await expect(linked.getByRole('alert')).toHaveText(
			'연결된 테스트 케이스를 불러오지 못했습니다'
		);
		await page.unroute(matrix);
		await linked.getByRole('button', { name: '다시 시도' }).press('Enter');
		await expect(linked.getByRole('link', { name: new RegExp(firstTitle) })).toHaveAttribute(
			'href',
			`/projects/${projectId}/test-cases/${firstId}`
		);
		await expect(linked.getByText('미실행', { exact: true })).toBeVisible();

		const otherLink = table.getByRole('button', { name: /테스트케이스 연결.*Other requirement/ });
		await otherLink.press('Enter');
		const dialog = page.getByRole('dialog', { name: '테스트케이스 연결' });
		await expect(dialog.getByRole('button', { name: new RegExp(firstTitle) })).toBeVisible();
		await page.keyboard.press('Escape');

		await table
			.getByRole('button', { name: new RegExp(`테스트케이스 연결.*${requirementTitle}`) })
			.press('Enter');
		await expect(dialog.getByRole('button', { name: new RegExp(firstTitle) })).toHaveCount(0);
		const search = dialog.locator('#trace-case-search');
		await search.fill('Available');
		const add = dialog.getByRole('button', { name: new RegExp(secondTitle) });
		const mutation = '**' + endpoint() + '/' + requirementId + '/test-cases';
		await page.route(mutation, (route) => route.fulfill({ status: 503, json: {} }));
		await add.press('Enter');
		await expect(dialog.getByRole('alert')).toContainText('저장하지 못했습니다');
		await expect(search).toHaveValue('Available');
		await page.unroute(mutation);
		await add.press('Enter');
		await expect(add).toHaveCount(0);
		await expect(search).toBeFocused();
		await page.keyboard.press('Escape');
		await expect(linked.getByRole('link', { name: new RegExp(secondTitle) })).toBeVisible();
		const secondRow = linked.getByRole('listitem').filter({ hasText: secondTitle });
		await secondRow.getByRole('button', { name: /연결 해제/ }).click();
		await page.getByRole('alertdialog').getByRole('button', { name: '연결 해제' }).click();
		await expect(linked.getByRole('link', { name: new RegExp(secondTitle) })).toHaveCount(0);

		const csv = await request.get(endpoint() + '/matrix/export');
		expect(csv.ok()).toBe(true);
		expect(csv.headers()['content-disposition']).toContain('.csv');
		expect(await csv.text()).toContain('TRACE-101');
	});

	for (const locale of ['ko', 'en'])
		for (const theme of ['light', 'dark'])
			for (const width of [375, 768, 1440]) {
				test(`${locale}/${theme}/${width}: requirement and linked cases fit the viewport`, async ({
					page
				}, testInfo) => {
					await page.setViewportSize({ width, height: 850 });
					await page.goto(url());
					await expect(
						page.locator(`button[aria-expanded]`).filter({ hasText: 'TRACE-101' })
					).toBeVisible();
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
					const table = page.getByRole('table', {
						name: locale === 'en' ? 'Requirements' : '요구사항'
					});
					const toggle = table.getByRole('button', { name: /TRACE-101/ });
					await toggle.press('Enter');
					await expect(toggle).toBeFocused();
					const target = table.locator(`#requirement-links-${requirementId}`);
					await expect(target.getByRole('link', { name: new RegExp(firstTitle) })).toBeVisible();
					await expect(table.locator(`#requirement-links-${alternateId}`)).toHaveCount(0);
					await expect(table.getByRole('columnheader')).toHaveCount(5);
					expect(
						await page.getByRole('main').evaluate((el) => el.scrollWidth > el.clientWidth)
					).toBe(false);
					const audit = await new AxeBuilder({ page })
						.include('.report-metrics')
						.withTags(['wcag2a', 'wcag2aa'])
						.analyze();
					expect(
						audit.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
					).toEqual([]);
					if (locale === 'ko' && width === 375) {
						await testInfo.attach('traceability-linked-cases', {
							body: await target.screenshot({ path: `/tmp/testmini-traceability-${theme}.png` }),
							contentType: 'image/png'
						});
					}
				});
			}
});
