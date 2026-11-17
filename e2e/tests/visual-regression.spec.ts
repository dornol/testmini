import { expect, test } from '../fixtures/auth.fixture';

test.describe.serial('Visual regression', () => {
	let projectId: string;

	test('create a stable empty project', async ({ page }) => {
		await page.goto('/projects/new');
		await page.fill('#name', `Visual Baseline ${Date.now()}`);
		await Promise.all([
			page.waitForURL(/\/projects\/\d+$/, { timeout: 15_000 }),
			page.click('button[type="submit"]')
		]);
		projectId = page.url().match(/\/projects\/(\d+)/)![1];
	});

	test('Korean light dashboard and customize state', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 1000 });
		await page.goto(`/projects/${projectId}`);
		await page.waitForLoadState('networkidle');

		const main = page.locator('main#main-content');
		await expect(main).toHaveScreenshot('dashboard-ko-light.png', {
			animations: 'disabled',
			mask: [main.getByRole('heading', { level: 1 })],
			maxDiffPixelRatio: 0.03
		});

		await page.getByRole('button', { name: '대시보드 레이아웃 커스터마이즈' }).click();
		await expect(main).toHaveScreenshot('dashboard-customizer-ko-light.png', {
			animations: 'disabled',
			mask: [main.getByRole('heading', { level: 1 })],
			maxDiffPixelRatio: 0.03
		});
	});

	test('Korean mobile empty test-case state', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(`/projects/${projectId}/test-cases`);
		await page.waitForLoadState('networkidle');

		const main = page.locator('main#main-content');
		await expect(main).toHaveScreenshot('test-cases-empty-ko-mobile.png', {
			animations: 'disabled',
			mask: [main.getByRole('heading', { level: 1 })],
			maxDiffPixelRatio: 0.03
		});
	});

	test('English dark dashboard', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 1000 });
		await page.goto(`/projects/${projectId}`);
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: '언어 변경' }).click();
		await page.getByRole('menuitem', { name: 'English' }).click();
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
		await page.waitForLoadState('networkidle');
		// Use the theme control so ModeWatcher and its persisted state stay in sync.
		await page.getByRole('button', { name: 'Toggle theme' }).click();
		await expect(page.locator('html')).toHaveClass(/dark/);

		const main = page.locator('main#main-content');
		await expect(main).toHaveScreenshot('dashboard-en-dark.png', {
			animations: 'disabled',
			mask: [main.getByRole('heading', { level: 1 })],
			maxDiffPixelRatio: 0.03
		});
	});
});
