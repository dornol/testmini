import { test, expect } from '../fixtures/auth.fixture';

const viewports = [
	{ name: 'desktop', width: 1440, height: 1000 },
	{ name: 'mobile', width: 390, height: 844 },
	{ name: 'small-mobile', width: 375, height: 812 },
	{ name: 'tablet', width: 768, height: 1024 }
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

test('mobile navigation closes on Escape and after following a link', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 812 });
	await page.goto('/projects');
	await page.waitForLoadState('networkidle');
	const trigger = page.locator('[aria-controls="app-sidebar"]');
	const sidebar = page.locator('#app-sidebar');
	await expect(sidebar).toHaveAttribute('inert', '');
	await trigger.click();
	await expect(trigger).toHaveAttribute('aria-expanded', 'true');
	await expect(sidebar).not.toHaveAttribute('inert', '');
	await sidebar.getByRole('link', { name: '내 업무', exact: true }).focus();
	await page.keyboard.press('Escape');
	await expect(trigger).toBeFocused();
	await expect(sidebar).toHaveAttribute('inert', '');
	await trigger.click();
	await sidebar.getByRole('link', { name: '내 업무', exact: true }).click();
	await expect(page).toHaveURL(/\/my-work$/);
	await expect(trigger).toHaveAttribute('aria-expanded', 'false');
	await expect(sidebar).toHaveAttribute('inert', '');
});
