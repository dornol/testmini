import { expect, test } from '../fixtures/auth.fixture';
import AxeBuilder from '@axe-core/playwright';

test.describe('My Work', () => {
	test('loads from global navigation with summary and filters', async ({ page }) => {
		await page.goto('/my-work');
		await page.waitForLoadState('networkidle');

		await expect(page.getByRole('heading', { level: 1, name: /내 업무|My Work/ })).toBeVisible();
		await expect(page.getByRole('navigation', { name: /주요 탐색|Main navigation/ }).getByRole('link', { name: /내 업무|My Work/ })).toBeVisible();
		await expect(page.getByRole('link', { name: /전체 업무|All work/ })).toHaveAttribute('aria-current', 'page');
		await expect(page.getByRole('combobox', { name: /^프로젝트$|^Project$/ })).toBeVisible();
		await expect(page.getByRole('combobox', { name: /^우선순위$|^Priority$/ })).toBeVisible();
	});

	test('keeps type and priority filters in the URL', async ({ page }) => {
		await page.goto('/my-work');
		await page.getByRole('link', { name: /재검증|Retests/ }).click();
		await expect(page.getByRole('link', { name: /재검증|Retests/ })).toHaveAttribute(
			'aria-current',
			'page'
		);
		await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
		await page.getByRole('combobox', { name: /^우선순위$|^Priority$/ }).selectOption('HIGH');
		await page.getByRole('button', { name: /필터 적용|Apply filters/ }).click();
		await expect(page).toHaveURL(/priority=HIGH/);

		expect(page.url()).toContain('type=RETEST');
		await expect(page.getByRole('link', { name: /재검증|Retests/ })).toHaveAttribute('aria-current', 'page');
		await expect(page.getByRole('link', { name: /필터 초기화|Clear filters/ })).toBeVisible();
	});

	test('has no serious accessibility violations', async ({ page }) => {
		await page.goto('/my-work');
		await page.waitForLoadState('networkidle');
		const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
		const seriousOrCritical = results.violations.filter(
			(violation) => violation.impact === 'serious' || violation.impact === 'critical'
		);
		expect(seriousOrCritical).toHaveLength(0);
	});

	test('does not overflow on a mobile viewport', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/my-work');
		await page.waitForLoadState('networkidle');
		const dimensions = await page.locator('body').evaluate((body) => ({
			scrollWidth: body.scrollWidth,
			clientWidth: body.clientWidth
		}));
		expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
	});
});
