import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures/auth.fixture';

test.describe('Admin audit logs UX', () => {
	test('filters submit with Enter and are labelled', async ({ page }) => {
		await page.goto('/admin/audit-logs');
		await page.waitForLoadState('networkidle');
		for (const label of ['사용자 ID', '액션', '시작일', '종료일'])
			await expect(page.getByLabel(label, { exact: true })).toBeVisible();

		const user = page.getByLabel('사용자 ID', { exact: true });
		await user.fill('nobody-with-this-id');
		await user.press('Enter');
		await expect(page).toHaveURL(/userId=nobody-with-this-id/);
		await expect(user).toHaveValue('nobody-with-this-id');
		await expect(page.getByRole('table').getByText('감사 로그 항목이 없습니다.')).toBeVisible();

		await page.getByRole('button', { name: '필터 초기화' }).click();
		await expect(page).toHaveURL(/\/admin\/audit-logs$/);
		await expect(user).toHaveValue('');
	});

	test('a user name filters the log to that user', async ({ page }) => {
		await page.goto('/admin/audit-logs');
		await page.waitForLoadState('networkidle');
		const link = page
			.getByRole('link', { name: /의 로그만 보기$/ })
			.locator('visible=true')
			.first();
		await expect(link).toBeVisible();
		await link.click();
		await expect(page).toHaveURL(/userId=/);
		await expect(page.getByLabel('사용자 ID', { exact: true })).not.toHaveValue('');
	});

	test('a project filter from the URL survives searching', async ({ page }) => {
		await page.goto('/admin/audit-logs?projectId=1');
		await page.waitForLoadState('networkidle');
		await expect(page.getByText('프로젝트 #1')).toBeVisible();
		await page.getByLabel('액션', { exact: true }).selectOption({ index: 1 });
		await page.getByRole('button', { name: '검색', exact: true }).click();
		await expect(page).toHaveURL(/projectId=1/);
		await expect(page).toHaveURL(/action=/);
	});

	for (const width of [375, 768, 1440]) {
		test(`fits and passes accessibility checks at ${width}px`, async ({ page }) => {
			await page.setViewportSize({ width, height: 800 });
			await page.goto('/admin/audit-logs');
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
