import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures/auth.fixture';

test.describe.serial('Admin OIDC providers list UX', () => {
	const key = randomUUID().slice(0, 8);
	const name = `UX Provider ${key}`;
	const slug = `ux-${key}`;
	const headers = (baseURL: string) => ({
		origin: baseURL,
		accept: 'application/json',
		'x-sveltekit-action': 'true'
	});
	let providerId: number;

	test.beforeAll(async ({ request, baseURL }) => {
		const created = await request.post('/admin/oidc-providers/new?/create', {
			form: {
				name,
				slug,
				providerType: 'OIDC',
				clientId: 'ux-client',
				clientSecret: 'ux-secret',
				authorizationUrl: 'https://1.1.1.1/authorize',
				tokenUrl: 'https://1.1.1.1/token'
			},
			headers: headers(baseURL!)
		});
		expect((await created.json()).type).toBe('redirect');

		// The list links each provider to its edit page by id.
		const page = await request.get('/admin/oidc-providers');
		const html = await page.text();
		const row = html
			.split(name)[0]
			.match(/\/admin\/oidc-providers\/(\d+)(?!.*\/admin\/oidc-providers\/\d+)/s);
		providerId = Number(row?.[1]);
		expect(providerId).toBeGreaterThan(0);
	});

	// Delete the fixture even when a test above failed halfway.
	test.afterAll(async ({ request, baseURL }) => {
		if (providerId)
			await request.post('/admin/oidc-providers?/deleteProvider', {
				form: { providerId: String(providerId) },
				headers: headers(baseURL!)
			});
	});

	test('disabling asks for confirmation naming the provider, and can be cancelled', async ({
		page
	}) => {
		await page.goto('/admin/oidc-providers');
		await page.waitForLoadState('networkidle');
		const disable = page.getByRole('button', { name: `${name} 비활성화` });
		await disable.press('Enter');
		const dialog = page.getByRole('alertdialog', { name: '상태 변경 확인' });
		await expect(dialog).toContainText(name);
		await dialog.getByRole('button', { name: '취소' }).press('Enter');
		await expect(dialog).toBeHidden();
		await expect(disable).toBeVisible();
	});

	test('confirming disables and re-enables the provider', async ({ page }) => {
		await page.goto('/admin/oidc-providers');
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: `${name} 비활성화` }).press('Enter');
		await page
			.getByRole('alertdialog', { name: '상태 변경 확인' })
			.getByRole('button', { name: '비활성화', exact: true })
			.press('Enter');
		const enable = page.getByRole('button', { name: `${name} 활성화` });
		await expect(enable).toBeVisible();

		await enable.press('Enter');
		await page
			.getByRole('alertdialog', { name: '상태 변경 확인' })
			.getByRole('button', { name: '활성화', exact: true })
			.press('Enter');
		await expect(page.getByRole('button', { name: `${name} 비활성화` })).toBeVisible();
	});

	for (const width of [375, 768, 1440]) {
		test(`fits and passes accessibility checks at ${width}px`, async ({ page }) => {
			await page.setViewportSize({ width, height: 800 });
			await page.goto('/admin/oidc-providers');
			await page.waitForLoadState('networkidle');
			// The page renders a card list (<768px) and a table; only one is visible.
			await expect(page.getByText(name).locator('visible=true')).toBeVisible();

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

	test('deleting asks for confirmation and removes a provider without linked accounts', async ({
		page
	}) => {
		await page.goto('/admin/oidc-providers');
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: `${name} 삭제` }).press('Enter');
		const dialog = page.getByRole('alertdialog', { name: '삭제' });
		await expect(dialog).toContainText(name);
		await dialog.getByRole('button', { name: '삭제', exact: true }).press('Enter');
		await expect(page.getByRole('button', { name: `${name} 삭제` })).toBeHidden();
	});
});
