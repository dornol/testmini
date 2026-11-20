import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth.fixture';

const widths = [375, 768, 1440];

async function expectAccessibleAndFitting(page: Page) {
	const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
	expect(
		result.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')
	).toEqual([]);
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('Login page UX', () => {
	test.use({ storageState: { cookies: [], origins: [] } });

	test('wrong credentials show a focused inline error and keep the email', async ({ page }) => {
		await page.goto('/auth/login');
		await page.waitForLoadState('networkidle');
		await page.getByLabel('이메일').fill('nobody@example.com');
		await page.getByLabel('비밀번호', { exact: true }).fill('not-the-password');
		await page.getByRole('button', { name: '로그인', exact: true }).press('Enter');

		const alert = page.getByRole('alert');
		await expect(alert).toContainText('이메일 또는 비밀번호가 올바르지 않습니다');
		await expect(alert).toBeFocused();
		await expect(page.getByLabel('이메일')).toHaveValue('nobody@example.com');
		await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeEnabled();
	});

	test('a failed SSO callback explains what happened', async ({ page }) => {
		await page.goto('/auth/login?error=oidc_callback_error');
		await expect(page.getByRole('alert')).toContainText('SSO 로그인에 실패했습니다');
		await expect(page.getByRole('heading', { level: 1, name: '로그인' })).toBeVisible();
	});

	test('password can be revealed and keeps autofill hints', async ({ page }) => {
		await page.goto('/auth/login');
		await page.waitForLoadState('networkidle');
		const password = page.getByLabel('비밀번호', { exact: true });
		await expect(password).toHaveAttribute('autocomplete', 'current-password');
		await expect(page.getByLabel('이메일')).toHaveAttribute('autocomplete', 'username');
		await page.getByRole('button', { name: '비밀번호 표시' }).press('Enter');
		await expect(password).toHaveAttribute('type', 'text');
		await expect(page.getByRole('button', { name: '비밀번호 표시' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
	});

	for (const width of widths) {
		test(`fits and passes accessibility checks at ${width}px`, async ({ page }) => {
			await page.setViewportSize({ width, height: 800 });
			await page.goto('/auth/login?error=oidc_callback_error');
			await expect(page.getByRole('alert')).toBeVisible();
			await expectAccessibleAndFitting(page);
		});
	}
});

test.describe('Linked accounts page UX', () => {
	test('has a heading, a way back and passes accessibility checks', async ({ page }) => {
		await page.goto('/auth/account');
		await expect(page.getByRole('heading', { level: 1, name: '연동된 계정' })).toBeVisible();
		for (const width of widths) {
			await page.setViewportSize({ width, height: 800 });
			await expectAccessibleAndFitting(page);
		}
		await page.getByRole('link', { name: '프로젝트로 돌아가기' }).click();
		await expect(page).toHaveURL(/\/projects/);
	});
});
