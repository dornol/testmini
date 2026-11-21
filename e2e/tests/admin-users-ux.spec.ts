import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures/auth.fixture';

test.describe.serial('Admin users UX', () => {
	const key = randomUUID().slice(0, 8);
	const name = `Pat ${key}`;
	const email = `pat-${key}@example.com`;
	let userId: string;

	test.beforeAll(async ({ request, baseURL }) => {
		const created = await request.post('/api/auth/admin/create-user', {
			data: { email, password: randomUUID(), name, role: 'user' },
			headers: { origin: baseURL! }
		});
		expect(created.ok()).toBe(true);
		userId = (await created.json()).user.id;
	});

	test.afterAll(async ({ request, baseURL }) => {
		if (userId)
			await request.post('/api/auth/admin/remove-user', {
				data: { userId },
				headers: { origin: baseURL! }
			});
	});

	test('the pending filter keeps the search term and updates the URL', async ({ page }) => {
		await page.goto('/admin/users');
		await page.waitForLoadState('networkidle');
		const search = page.getByRole('searchbox');
		await search.fill(email);
		await search.press('Enter');
		await expect(page).toHaveURL(new RegExp(`search=${encodeURIComponent(email)}`));
		await expect(page.getByRole('table').getByText(email)).toBeVisible();

		const pending = page.getByRole('button', { name: '대기만 보기' });
		await pending.click();
		await expect(page).toHaveURL(/pending=true/);
		await expect(page).toHaveURL(new RegExp(`search=${encodeURIComponent(email)}`));
		await expect(page.getByRole('button', { name: '대기만 보기' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expect(search).toHaveValue(email);
		await expect(page.getByRole('table').getByText('사용자를 찾을 수 없습니다.')).toBeVisible();
	});

	test('changing a role needs confirmation and can be cancelled', async ({ page }) => {
		await page.goto(`/admin/users?search=${encodeURIComponent(email)}`);
		await page.waitForLoadState('networkidle');
		const makeAdmin = page.getByRole('button', { name: `${name} 관리자 지정` });
		await makeAdmin.press('Enter');

		const dialog = page.getByRole('alertdialog', { name: '역할 변경' });
		await expect(dialog).toContainText(name);
		await dialog.getByRole('button', { name: '취소' }).press('Enter');
		await expect(dialog).toBeHidden();
		await expect(makeAdmin).toBeVisible();
	});

	test('confirming promotes and demotes the user', async ({ page }) => {
		await page.goto(`/admin/users?search=${encodeURIComponent(email)}`);
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: `${name} 관리자 지정` }).press('Enter');
		await page
			.getByRole('alertdialog', { name: '역할 변경' })
			.getByRole('button', { name: '관리자 지정' })
			.press('Enter');
		const removeAdmin = page.getByRole('button', { name: `${name} 관리자 해제` });
		await expect(removeAdmin).toBeVisible();

		await removeAdmin.press('Enter');
		await page
			.getByRole('alertdialog', { name: '역할 변경' })
			.getByRole('button', { name: '관리자 해제' })
			.press('Enter');
		await expect(page.getByRole('button', { name: `${name} 관리자 지정` })).toBeVisible();
	});

	for (const width of [375, 768, 1440]) {
		test(`fits and passes accessibility checks at ${width}px`, async ({ page }) => {
			await page.setViewportSize({ width, height: 800 });
			await page.goto(`/admin/users?search=${encodeURIComponent(key)}`);
			await page.waitForLoadState('networkidle');
			// The page renders a card list (<640px) and a table; only one is visible.
			await expect(page.getByText(email).locator('visible=true')).toBeVisible();

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
