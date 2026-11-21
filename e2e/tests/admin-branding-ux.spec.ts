import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures/auth.fixture';

// 1x1 transparent PNG.
const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
	'base64'
);

// The branding config is global, so remember it and put it back afterwards.
test.describe.serial('Admin branding UX', () => {
	const key = randomUUID().slice(0, 8);
	const appName = `Branding UX ${key}`;
	let original = { appName: 'testmini', hasImages: false };

	test.beforeAll(async ({ request }) => {
		const html = await (await request.get('/admin/branding')).text();
		const tag = html.match(/<input[^>]*id="appName"[^>]*>/)?.[0] ?? '';
		original = {
			appName: tag.match(/value="([^"]*)"/)?.[1] || 'testmini',
			hasImages: /현재 (로고|파비콘)/.test(html)
		};
	});

	test.afterAll(async ({ request, baseURL }) => {
		await request.post('/admin/branding?/save', {
			multipart: { appName: original.appName, removeLogo: 'true', removeFavicon: 'true' },
			headers: { origin: baseURL!, accept: 'application/json', 'x-sveltekit-action': 'true' }
		});
	});

	test('upload buttons are distinguishable and limits are stated', async ({ page }) => {
		await page.goto('/admin/branding');
		await page.waitForLoadState('networkidle');
		await expect(page.getByRole('button', { name: '로고 업로드' })).toBeVisible();
		await expect(page.getByRole('button', { name: '파비콘 업로드' })).toBeVisible();
		await expect(page.getByText('PNG, JPEG, WebP · 최대 2MB')).toBeVisible();
		await expect(page.locator('input[name=logo]')).not.toHaveAttribute('accept', /svg/);
	});

	test('a wrong or oversized file is rejected before anything is uploaded', async ({ page }) => {
		let posted = false;
		page.on('request', (r) => {
			if (r.method() === 'POST') posted = true;
		});
		await page.goto('/admin/branding');
		await page.waitForLoadState('networkidle');

		await page.locator('input[name=logo]').setInputFiles({
			name: 'logo.svg',
			mimeType: 'image/svg+xml',
			buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')
		});
		await expect(page.getByRole('alert')).toContainText('지원하지 않는 형식');

		await page.locator('input[name=logo]').setInputFiles({
			name: 'big.png',
			mimeType: 'image/png',
			buffer: Buffer.alloc(3 * 1024 * 1024)
		});
		await expect(page.getByRole('alert')).toContainText('파일이 너무 큽니다');
		await expect(page.getByRole('alert')).toContainText('big.png');
		expect(posted).toBe(false);
	});

	test('saving a new name and logo applies them; removing the logo reverts it', async ({
		page
	}) => {
		test.skip(original.hasImages, 'Would replace an existing logo/favicon.');
		await page.goto('/admin/branding');
		await page.waitForLoadState('networkidle');
		await page.locator('#appName').fill(appName);
		await page
			.locator('input[name=logo]')
			.setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
		await expect(page.getByText('선택한 파일: logo.png')).toBeVisible();
		await expect(page.getByAltText('새 로고 미리보기')).toBeVisible();

		await page.getByRole('button', { name: '변경사항 저장' }).press('Enter');
		await expect(page.getByText('브랜딩 설정이 저장되었습니다')).toBeVisible();
		await expect(page.getByRole('banner')).toContainText(appName);

		// The stored image is really served, and survives a reload.
		await page.reload();
		await page.waitForLoadState('networkidle');
		await expect(page.locator('#appName')).toHaveValue(appName);
		const current = page.getByAltText('현재 로고');
		await expect(current).toBeVisible();
		await expect(current).toHaveJSProperty('naturalWidth', 1);

		await page.getByRole('button', { name: '로고 제거' }).press('Enter');
		await expect(page.getByText('저장하면 로고이(가) 제거됩니다.')).toBeVisible();
		await page.getByRole('button', { name: '변경사항 저장' }).press('Enter');
		await expect(page.getByText('브랜딩 설정이 저장되었습니다')).toBeVisible();
		await expect(page.getByAltText('기본 로고')).toBeVisible();
	});

	for (const width of [375, 768, 1440]) {
		test(`fits and passes accessibility checks at ${width}px`, async ({ page }) => {
			await page.setViewportSize({ width, height: 800 });
			await page.goto('/admin/branding');
			await page.waitForLoadState('networkidle');
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
