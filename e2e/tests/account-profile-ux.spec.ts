import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import type { BrowserContext } from '@playwright/test';
import { test, expect } from '../fixtures/auth.fixture';

// Uses its own user so the admin's password and name are never touched.
test.describe.serial('Account profile UX', () => {
	const key = randomUUID().slice(0, 8);
	const email = `profile-${key}@example.com`;
	const oldPassword = `old-${randomUUID()}`;
	const newPassword = `new-${randomUUID()}`;
	let userId: string;
	let context: BrowserContext;

	test.beforeAll(async ({ request, browser, baseURL }) => {
		const created = await request.post('/api/auth/admin/create-user', {
			data: { email, password: oldPassword, name: `Profile ${key}`, role: 'user' },
			headers: { origin: baseURL! }
		});
		expect(created.ok()).toBe(true);
		userId = (await created.json()).user.id;

		context = await browser.newContext({ baseURL, storageState: undefined });
		const signedIn = await context.request.post('/api/auth/sign-in/email', {
			data: { email, password: oldPassword },
			headers: { origin: baseURL! }
		});
		expect(signedIn.ok()).toBe(true);
	});

	test.afterAll(async ({ request, baseURL }) => {
		await context?.close();
		if (userId)
			await request.post('/api/auth/admin/remove-user', {
				data: { userId },
				headers: { origin: baseURL! }
			});
	});

	test('password fields have autofill hints, a rule and one reveal toggle', async () => {
		const page = await context.newPage();
		await page.goto('/account/profile');
		await page.waitForLoadState('networkidle');
		await expect(page.locator('#currentPassword')).toHaveAttribute(
			'autocomplete',
			'current-password'
		);
		await expect(page.locator('#newPassword')).toHaveAttribute('autocomplete', 'new-password');
		await expect(page.getByText('8자 이상 입력하세요.')).toBeVisible();

		await page.getByLabel('비밀번호 표시').check();
		for (const id of ['currentPassword', 'newPassword', 'confirmPassword'])
			await expect(page.locator(`#${id}`)).toHaveAttribute('type', 'text');
		await page.close();
	});

	test('mistakes are caught on the field before any request is sent', async () => {
		const page = await context.newPage();
		let posted = false;
		page.on('request', (r) => {
			if (r.method() === 'POST') posted = true;
		});
		await page.goto('/account/profile');
		await page.waitForLoadState('networkidle');

		await page.locator('#currentPassword').fill(oldPassword);
		await page.locator('#newPassword').fill('short');
		await page.locator('#confirmPassword').fill('short');
		await page.getByRole('button', { name: '비밀번호 변경', exact: true }).press('Enter');
		await expect(page.locator('#newPassword-error')).toContainText('8자 이상');
		await expect(page.locator('#newPassword')).toBeFocused();

		await page.locator('#newPassword').fill(newPassword);
		await page.locator('#confirmPassword').fill(`${newPassword}-typo`);
		await page.getByRole('button', { name: '비밀번호 변경', exact: true }).press('Enter');
		await expect(page.locator('#confirmPassword-error')).toContainText('일치하지 않습니다');
		await expect(page.locator('#confirmPassword')).toBeFocused();
		expect(posted).toBe(false);
		await page.close();
	});

	test('a wrong current password is reported on its field and input is kept', async () => {
		const page = await context.newPage();
		await page.goto('/account/profile');
		await page.waitForLoadState('networkidle');
		await page.locator('#currentPassword').fill('definitely-not-it');
		await page.locator('#newPassword').fill(newPassword);
		await page.locator('#confirmPassword').fill(newPassword);
		await page.getByRole('button', { name: '비밀번호 변경', exact: true }).press('Enter');

		await expect(page.locator('#currentPassword-error')).toContainText('올바르지 않습니다');
		await expect(page.locator('#currentPassword')).toBeFocused();
		await expect(page.locator('#newPassword')).toHaveValue(newPassword);
		await page.close();
	});

	test('changing the password works and the new one signs in', async ({ baseURL }) => {
		const page = await context.newPage();
		await page.goto('/account/profile');
		await page.waitForLoadState('networkidle');
		await page.locator('#currentPassword').fill(oldPassword);
		await page.locator('#newPassword').fill(newPassword);
		await page.locator('#confirmPassword').fill(newPassword);
		await page.getByRole('button', { name: '비밀번호 변경', exact: true }).press('Enter');
		await expect(page.getByText('비밀번호가 변경되었습니다')).toBeVisible();
		for (const id of ['currentPassword', 'newPassword', 'confirmPassword'])
			await expect(page.locator(`#${id}`)).toHaveValue('');
		await page.close();

		const fresh = await context
			.browser()!
			.newContext({ baseURL: baseURL!, storageState: undefined });
		const res = await fresh.request.post('/api/auth/sign-in/email', {
			data: { email, password: newPassword },
			headers: { origin: baseURL! }
		});
		expect(res.ok()).toBe(true);
		await fresh.close();
	});

	test('a blank name is explained on the field; a real name saves', async () => {
		const page = await context.newPage();
		await page.goto('/account/profile');
		await page.waitForLoadState('networkidle');
		const name = page.locator('#displayName');
		await name.fill('   ');
		await page.getByRole('button', { name: '변경사항 저장' }).first().press('Enter');
		await expect(page.locator('#displayName-error')).toContainText('1~100자');
		await expect(name).toBeFocused();

		await name.fill(`Renamed ${key}`);
		await page.getByRole('button', { name: '변경사항 저장' }).first().press('Enter');
		await expect(page.getByText('이름이 수정되었습니다')).toBeVisible();
		await page.close();
	});

	test('the three save buttons can be told apart by description', async () => {
		const page = await context.newPage();
		await page.goto('/account/profile');
		await page.waitForLoadState('networkidle');
		// Each button is described by its own section title.
		for (const [id, title] of [
			['profile-info-title', '계정 정보'],
			['profile-pref-title', '환경 설정'],
			['profile-notif-title', '알림 설정']
		])
			await Promise.all([
				expect(page.locator(`#${id}`)).toHaveText(title),
				expect(page.locator(`button[aria-describedby="${id}"]`)).toHaveCount(1)
			]);
		await page.close();
	});

	for (const width of [375, 768, 1440]) {
		test(`fits and passes accessibility checks at ${width}px`, async () => {
			const page = await context.newPage();
			await page.setViewportSize({ width, height: 800 });
			await page.goto('/account/profile');
			await page.waitForLoadState('networkidle');
			const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
			expect(
				result.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')
			).toEqual([]);
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth
			);
			expect(overflow).toBeLessThanOrEqual(0);
			await page.close();
		});
	}
});
