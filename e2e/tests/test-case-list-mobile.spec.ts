import { randomUUID } from 'node:crypto';
import { test, expect } from '../fixtures/auth.fixture';

// On a phone the case list used to start at y=742 of an 800px screen: header buttons stacked,
// every filter shown, and the column and run controls on separate lines.
test.describe.serial('Test case list on a phone', () => {
	const key = randomUUID().slice(0, 8);
	let projectId: number;
	let headers: Record<string, string>;

	test.beforeAll(async ({ request, baseURL }) => {
		headers = { origin: baseURL! };
		const project = await request.post('/api/projects', {
			data: { name: `Phone list ${key}` },
			headers
		});
		expect(project.ok()).toBe(true);
		projectId = (await project.json()).data.id;
		for (const title of ['One', 'Two']) {
			const res = await request.post(`/projects/${projectId}/test-cases/new`, {
				data: new URLSearchParams({ title: `${title} ${key}` }).toString(),
				headers: {
					...headers,
					'content-type': 'application/x-www-form-urlencoded',
					accept: 'application/json',
					'x-sveltekit-action': 'true'
				}
			});
			expect((await res.json()).type).toBe('redirect');
		}
	});

	// Projects cannot be deleted, so leave the fixture inactive.
	test.afterAll(async ({ request }) => {
		if (projectId)
			await request.post(`/projects/${projectId}/settings?/deactivate`, {
				form: {},
				headers: { ...headers, accept: 'application/json', 'x-sveltekit-action': 'true' }
			});
	});

	const open = async (page: import('@playwright/test').Page, query = '') => {
		await page.goto(`/projects/${projectId}/test-cases${query}`);
		await page.waitForLoadState('networkidle');
	};

	test('the list starts high on the screen and the header takes one row', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 800 });
		await open(page);

		const newCase = page.getByRole('link', { name: '새 테스트 케이스' });
		const menu = page.getByRole('button', { name: '작업', exact: true }).first();
		const [a, b] = [(await newCase.boundingBox())!, (await menu.boundingBox())!];
		expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(2); // same row

		const firstRow = (await page
			.getByRole('checkbox', { name: /TC-\d+/ })
			.first()
			.boundingBox())!;
		// It was 742. Leave room for the browser chrome: the rows must be on the first screen.
		expect(firstRow.y).toBeLessThan(520);
	});

	test('export and import live in the actions menu on a phone', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 800 });
		await open(page);
		await page.getByRole('button', { name: '작업', exact: true }).first().click();
		await expect(page.getByRole('menuitem', { name: 'CSV로 내보내기' })).toBeVisible();
		await expect(page.getByRole('menuitem', { name: 'JSON으로 내보내기' })).toBeVisible();
		await expect(page.getByRole('menuitem', { name: '가져오기' })).toBeVisible();
		await page.keyboard.press('Escape');
	});

	test('filters open from one toggle, search stays visible and the active count shows', async ({
		page
	}) => {
		await page.setViewportSize({ width: 375, height: 800 });
		await open(page);
		const toggle = page.locator('[aria-controls=tc-filter-panel]');
		const priority = page.getByRole('button', { name: '우선순위', exact: true });
		await expect(page.getByLabel('제목 또는 키로 검색...')).toBeVisible();
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
		await expect(priority).toBeHidden();

		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
		await expect(priority).toBeVisible();
		await toggle.click();
		await expect(priority).toBeHidden();

		// A filter coming from the URL is counted on the closed toggle.
		await open(page, '?priority=MEDIUM');
		await expect(page.locator('[aria-controls=tc-filter-panel]')).toContainText('(1)');
	});

	test('a wide screen keeps every filter and all three header buttons visible', async ({
		page
	}) => {
		await open(page);
		await expect(page.locator('[aria-controls=tc-filter-panel]')).toBeHidden();
		await expect(page.getByRole('button', { name: '우선순위', exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: '내보내기', exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: '가져오기', exact: true })).toBeVisible();
		await expect(page.getByRole('link', { name: '새 테스트 케이스' })).toBeVisible();
	});
});
