import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import type { APIRequestContext } from '@playwright/test';
import { test, expect } from '../fixtures/auth.fixture';

test.describe.serial('Admin OIDC provider form UX', () => {
	const key = randomUUID().slice(0, 8);
	const fixture = { name: `Form Fixture ${key}`, slug: `ff-${key}` };
	const created = { name: `Form UX ${key}`, slug: `form-ux-${key}` };
	const jwks = 'https://1.1.1.1/jwks';
	const ids: number[] = [];
	const headers = (baseURL: string) => ({
		origin: baseURL,
		accept: 'application/json',
		'x-sveltekit-action': 'true'
	});

	// The list page links each provider to its edit page by id.
	async function idOf(request: APIRequestContext, name: string) {
		const html = await (await request.get('/admin/oidc-providers')).text();
		const match = html
			.split(name)[0]
			.match(/\/admin\/oidc-providers\/(\d+)(?!.*\/admin\/oidc-providers\/\d+)/s);
		return Number(match?.[1]);
	}

	test.beforeAll(async ({ request, baseURL }) => {
		const res = await request.post('/admin/oidc-providers/new?/create', {
			form: {
				...fixture,
				providerType: 'OIDC',
				clientId: 'ux-client',
				clientSecret: 'ux-secret',
				issuerUrl: 'https://1.1.1.1',
				jwksUri: jwks,
				authorizationUrl: 'https://1.1.1.1/authorize',
				tokenUrl: 'https://1.1.1.1/token'
			},
			headers: headers(baseURL!)
		});
		expect((await res.json()).type).toBe('redirect');
		ids.push(await idOf(request, fixture.name));
		expect(ids[0]).toBeGreaterThan(0);
	});

	// Remove fixtures even when a test above failed halfway.
	test.afterAll(async ({ request, baseURL }) => {
		for (const id of ids)
			await request.post(`/admin/oidc-providers/${id}?/deleteProvider`, {
				form: {},
				headers: headers(baseURL!)
			});
	});

	test('create: slug follows the name, errors attach to their field', async ({ page, request }) => {
		await page.goto('/admin/oidc-providers/new');
		await page.waitForLoadState('networkidle');
		await page.locator('#name').fill(created.name);
		await expect(page.locator('#slug')).toHaveValue(created.slug);
		await expect(page.locator('#redirectUri')).toHaveValue(
			new RegExp(`/auth/oidc/${created.slug}/callback$`)
		);
		await expect(page.locator('#clientSecret')).toHaveAttribute('autocomplete', 'new-password');

		await page.locator('#clientId').fill('ux-client');
		await page.locator('#clientSecret').fill('ux-secret');
		await page.locator('#authorizationUrl').fill('https://1.1.1.1/authorize');
		await page.locator('#tokenUrl').fill('https://1.1.1.1/token');

		// A taken slug is reported on the slug field, in the focused error summary.
		await page.locator('#slug').fill(fixture.slug);
		await page.getByRole('button', { name: '제공자 추가', exact: true }).press('Enter');
		const summary = page.locator('[data-slot=form-error-summary]');
		await expect(summary).toBeFocused();
		await expect(summary).toContainText('이미 사용 중인 슬러그');
		await expect(page.locator('#slug')).toHaveAttribute('aria-invalid', 'true');
		await expect(page.locator('#slug-error')).toContainText('이미 사용 중인 슬러그');
		// Everything typed so far is kept.
		await expect(page.locator('#name')).toHaveValue(created.name);

		// A non-HTTPS endpoint is reported on that endpoint.
		await page.locator('#slug').fill(created.slug);
		await page.locator('#authorizationUrl').fill('http://1.1.1.1/authorize');
		await page.getByRole('button', { name: '제공자 추가', exact: true }).press('Enter');
		await expect(page.locator('#authorizationUrl')).toHaveAttribute('aria-invalid', 'true');
		await expect(page.locator('#authorizationUrl-error')).toBeVisible();
		await summary.getByRole('link').press('Enter');
		await expect(page.locator('#authorizationUrl')).toBeFocused();

		// Fixing it creates the provider.
		await page.locator('#authorizationUrl').fill('https://1.1.1.1/authorize');
		await page.getByRole('button', { name: '제공자 추가', exact: true }).press('Enter');
		await expect(page).toHaveURL(/\/admin\/oidc-providers$/);
		ids.push(await idOf(request, created.name));
	});

	test('edit: saving keeps the JWKS URI and the current secret', async ({ page }) => {
		await page.goto(`/admin/oidc-providers/${ids[0]}`);
		await page.waitForLoadState('networkidle');
		await expect(page.locator('#jwksUri')).toHaveValue(jwks);
		await expect(page.locator('#clientSecret')).not.toHaveAttribute('required', '');

		await page.locator('#name').fill(`${fixture.name} edited`);
		await page.getByRole('button', { name: '변경사항 저장' }).press('Enter');
		await expect(page.getByText('제공자가 수정되었습니다')).toBeVisible();

		await page.reload();
		await page.waitForLoadState('networkidle');
		await expect(page.locator('#name')).toHaveValue(`${fixture.name} edited`);
		await expect(page.locator('#jwksUri')).toHaveValue(jwks);
	});

	for (const width of [375, 768, 1440]) {
		test(`new and edit pages fit and pass accessibility checks at ${width}px`, async ({ page }) => {
			await page.setViewportSize({ width, height: 800 });
			for (const path of ['/admin/oidc-providers/new', `/admin/oidc-providers/${ids[0]}`]) {
				await page.goto(path);
				await page.waitForLoadState('networkidle');
				const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
				expect(
					result.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')
				).toEqual([]);
				const overflow = await page.evaluate(
					() => document.documentElement.scrollWidth - document.documentElement.clientWidth
				);
				expect(overflow).toBeLessThanOrEqual(0);
			}
		});
	}

	test('delete from the edit page asks for confirmation and returns to the list', async ({
		page
	}) => {
		await page.goto(`/admin/oidc-providers/${ids[1]}`);
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: '삭제', exact: true }).press('Enter');
		const dialog = page.getByRole('alertdialog', { name: '삭제' });
		await expect(dialog).toContainText(created.name);
		await dialog.getByRole('button', { name: '삭제', exact: true }).press('Enter');
		await expect(page).toHaveURL(/\/admin\/oidc-providers$/);
		await expect(page.getByText(created.name)).toHaveCount(0);
	});
});
