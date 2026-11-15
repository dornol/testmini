import { test, expect } from '../fixtures/auth.fixture';

const viewports = [
	{ name: 'desktop', width: 1440, height: 1000 },
	{ name: 'mobile', width: 390, height: 844 }
] as const;

test.describe.serial('UI layout regression', () => {
	let projectId: string;

	test('create an isolated project', async ({ page }) => {
		await page.goto('/projects/new');
		await page.fill('#name', `Layout Project ${Date.now()}`);
		await Promise.all([
			page.waitForURL(/\/projects\/\d+$/, { timeout: 15_000 }),
			page.click('button[type="submit"]')
		]);

		const match = page.url().match(/\/projects\/(\d+)/);
		expect(match).not.toBeNull();
		projectId = match![1];
	});

	for (const viewport of viewports) {
		test(`${viewport.name}: core project pages do not overflow horizontally`, async ({
			page
		}, testInfo) => {
			await page.setViewportSize(viewport);

			for (const route of ['', '/test-cases', '/test-runs', '/reports', '/quality']) {
				await page.goto(`/projects/${projectId}${route}`);
				await page.waitForLoadState('networkidle');

				const dimensions = await page.locator('body').evaluate((body) => ({
					scrollWidth: body.scrollWidth,
					clientWidth: body.clientWidth
				}));
				expect(
					dimensions.scrollWidth,
					`${route || '/'} overflowed at ${viewport.name}`
				).toBeLessThanOrEqual(dimensions.clientWidth);
			}

			await testInfo.attach(`quality-${viewport.name}`, {
				body: await page.screenshot({ fullPage: true }),
				contentType: 'image/png'
			});
		});
	}

	test('report date controls share the same geometry', async ({ page }) => {
		await page.setViewportSize(viewports[0]);
		await page.goto(`/projects/${projectId}/reports`);
		await page.waitForLoadState('networkidle');

		const fromBox = await page.locator('#date-from').boundingBox();
		const toBox = await page.locator('#date-to').boundingBox();
		expect(fromBox).not.toBeNull();
		expect(toBox).not.toBeNull();
		expect(Math.abs(fromBox!.y - toBox!.y)).toBeLessThanOrEqual(1);
		expect(Math.abs(fromBox!.height - toBox!.height)).toBeLessThanOrEqual(1);
		expect(Math.abs(fromBox!.width - toBox!.width)).toBeLessThanOrEqual(1);
	});
});
