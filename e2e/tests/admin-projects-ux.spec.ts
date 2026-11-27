import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures/auth.fixture';

test.describe.serial('Admin projects UX', () => {
	const key = randomUUID().slice(0, 8);
	const name = `Admin UX ${key}`;
	let projectId: number;

	test.beforeAll(async ({ request, baseURL }) => {
		const created = await request.post('/projects/new', {
			form: { name },
			headers: { origin: baseURL!, accept: 'application/json', 'x-sveltekit-action': 'true' }
		});
		expect(created.ok()).toBe(true);
		const result = await created.json();
		expect(result.type).toBe('redirect');
		projectId = Number(result.location.split('/').at(-1));
	});

	// Projects cannot be deleted, so leave the fixture inactive.
	test.afterAll(async ({ request, baseURL }) => {
		if (projectId)
			await request.post(`/projects/${projectId}/settings?/deactivate`, {
				form: {},
				headers: { origin: baseURL!, accept: 'application/json', 'x-sveltekit-action': 'true' }
			});
	});

	test('the inactive filter keeps the search term and updates the URL', async ({ page }) => {
		await page.goto(`/admin/projects?search=${encodeURIComponent(key)}`);
		await page.waitForLoadState('networkidle');
		const toggle = page.getByRole('button', { name: '비활성 포함' });
		await expect(toggle).toHaveAttribute('aria-pressed', 'false');
		await toggle.click();
		await expect(page).toHaveURL(/inactive=true/);
		await expect(page).toHaveURL(new RegExp(`search=${encodeURIComponent(key)}`));
		await expect(page.getByRole('button', { name: '비활성 포함' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expect(page.getByRole('searchbox')).toHaveValue(key);
	});

	test('deactivating asks for confirmation naming the project, and can be cancelled', async ({
		page
	}) => {
		await page.goto(`/admin/projects?search=${encodeURIComponent(key)}`);
		await page.waitForLoadState('networkidle');
		const deactivate = page.getByRole('button', { name: `${name} 비활성화` });
		await deactivate.press('Enter');
		const dialog = page.getByRole('alertdialog', { name: '상태 변경 확인' });
		await expect(dialog).toContainText(name);
		await dialog.getByRole('button', { name: '취소' }).press('Enter');
		await expect(dialog).toBeHidden();
		await expect(deactivate).toBeVisible();
	});

	test('confirming deactivates and reactivates the project', async ({ page }) => {
		await page.goto(`/admin/projects?search=${encodeURIComponent(key)}&inactive=true`);
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: `${name} 비활성화` }).press('Enter');
		await page
			.getByRole('alertdialog', { name: '상태 변경 확인' })
			.getByRole('button', { name: '비활성화', exact: true })
			.press('Enter');
		const activate = page.getByRole('button', { name: `${name} 활성화` });
		await expect(activate).toBeVisible();

		await activate.press('Enter');
		await page
			.getByRole('alertdialog', { name: '상태 변경 확인' })
			.getByRole('button', { name: '활성화', exact: true })
			.press('Enter');
		await expect(page.getByRole('button', { name: `${name} 비활성화` })).toBeVisible();
	});

	for (const width of [375, 768, 1440]) {
		test(`fits and passes accessibility checks at ${width}px`, async ({ page }) => {
			await page.setViewportSize({ width, height: 800 });
			await page.goto(`/admin/projects?search=${encodeURIComponent(key)}`);
			await page.waitForLoadState('networkidle');
			// The page renders a card list (<640px) and a table; only one is visible. Stay inside
			// <main>: the header's project switcher can show the same name.
			await expect(page.getByRole('main').getByText(name).locator('visible=true')).toBeVisible();

			const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
			expect(
				result.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')
			).toEqual([]);
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth
			);
			expect(overflow).toBeLessThanOrEqual(0);
		});
	}
});
