import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures/auth.fixture';

test.describe('Project issue tracker settings', () => {
	let projectId: number;
	const path = () => `/projects/${projectId}/settings/issue-tracker`;
	const api = () => `/api/projects/${projectId}/issue-tracker`;

	test.beforeAll(async ({ request }) => {
		const result = await request.post('/api/projects', {
			data: { name: `Issue tracker ${randomUUID()}` }
		});
		expect(result.ok()).toBe(true);
		projectId = (await result.json()).data.id;
	});

	test.afterAll(async ({ request }) => {
		if (projectId) expect((await request.delete(`/api/projects/${projectId}`)).ok()).toBe(true);
	});

	test('validates headers, restores failed actions and does not reuse credentials across providers', async ({
		page
	}) => {
		await page.setViewportSize({ width: 375, height: 850 });
		await page.addInitScript(() => {
			Object.defineProperty(navigator, 'clipboard', {
				configurable: true,
				value: { writeText: () => Promise.reject(new Error('Clipboard unavailable')) }
			});
		});
		await page.goto(path());
		await page.waitForLoadState('networkidle');
		const main = page.getByRole('main');
		const provider = main.getByRole('combobox', { name: '제공자' });
		const save = main.getByRole('button', { name: '설정 저장' });
		const token = main.getByLabel('API 토큰');
		const copy = main.getByRole('button', { name: 'URL 복사' });
		await copy.press('Enter');
		const webhook = main.getByRole('textbox', { name: '웹훅 URL' });
		await expect(webhook).toBeFocused();
		expect(await webhook.evaluate((field) => (field as HTMLInputElement).selectionEnd)).toBe(
			(await webhook.inputValue()).length
		);
		await expect(main.getByRole('status').filter({ hasText: '직접 복사' })).toBeVisible();

		await provider.selectOption('CUSTOM');
		const headers = main.getByLabel('커스텀 헤더 (JSON)');
		await main.getByLabel('엔드포인트 URL').fill('https://example.com/issues');
		await headers.fill('{"x-integration": [1, 2]}');
		const actionUrl = '**' + api();
		const failed = { status: 503, json: { error: 'Fixture unavailable' } };
		let received: Record<string, unknown> | undefined;
		await page.route(actionUrl, (route) => {
			received = route.request().postDataJSON();
			return route.fulfill(failed);
		});
		await save.press('Enter');
		await expect(main.getByRole('alert')).toBeFocused();
		await expect(headers).toHaveAttribute('aria-invalid', 'true');
		expect(received).toBeUndefined();
		await headers.fill('{"x-integration":"sandbox"}');
		await save.press('Enter');
		await expect(main.getByRole('alert')).toContainText('저장하지 못했습니다');
		await expect(headers).toHaveValue('{"x-integration":"sandbox"}');

		await provider.selectOption('GITHUB');
		await main.getByLabel('저장소').fill('demo/example');
		await token.fill('   ');
		await save.press('Enter');
		await expect(token).toHaveAttribute('aria-invalid', 'true');
		await expect(main.getByRole('alert')).toHaveText('API 토큰 항목을 입력하세요.');
		await token.fill('synthetic-issue-token');
		await save.press('Enter');
		await expect(main.getByRole('alert')).toBeFocused();
		await expect(token).toHaveValue('synthetic-issue-token');
		await page.unroute(actionUrl);
		await save.press('Enter');
		await expect(
			main.getByRole('status').filter({ hasText: '설정이 저장되었습니다' })
		).toBeVisible();
		await expect(token).toHaveValue('');
		await expect(token).not.toHaveAttribute('required', '');
		await page.reload();
		await page.waitForLoadState('networkidle');
		await expect(provider).toHaveValue('GITHUB');
		await expect(main.getByLabel('저장소')).toHaveValue('demo/example');
		await expect(token).toHaveValue('');
		await expect(main.getByText('비워 두면 저장된 토큰을 사용합니다.')).toBeVisible();

		const connect = '**' + api() + '/test';
		await page.route(connect, (route) =>
			route.fulfill({ json: { ok: false, message: 'Simulated provider rejection' } })
		);
		await main.getByRole('button', { name: '연결 테스트' }).press('Enter');
		await expect(main.getByRole('alert')).toHaveText('연결 실패');
		await expect(main.getByRole('alert')).toBeFocused();
		await page.unroute(connect);
		await page.route(connect, (route) =>
			route.fulfill({ json: { ok: true, message: 'Simulated provider success' } })
		);
		await main.getByRole('button', { name: '연결 테스트' }).press('Enter');
		await expect(main.getByRole('status').filter({ hasText: '연결 성공' })).toBeVisible();

		await provider.selectOption('GITLAB');
		await expect(token).toHaveAttribute('required', '');
		await expect(main.getByRole('button', { name: '연결 테스트' })).toHaveCount(0);
		await provider.selectOption('CUSTOM');
		await main.getByLabel('엔드포인트 URL').fill('https://example.com/issues');
		await headers.fill('{"x-integration":"sandbox"}');
		await page.route(actionUrl, (route) => {
			received = route.request().postDataJSON();
			return route.fulfill(failed);
		});
		await save.press('Enter');
		await expect(main.getByRole('alert')).toBeFocused();
		expect(received).toMatchObject({ provider: 'CUSTOM', apiToken: null, webhookSecret: null });
		await page.unroute(actionUrl);

		const remove = main.getByRole('button', { name: '삭제', exact: true });
		await remove.press('Enter');
		const dialog = page.getByRole('alertdialog', { name: '설정 제거' });
		await dialog.getByRole('button', { name: '취소' }).press('Enter');
		await expect(remove).toBeFocused();
		await remove.press('Enter');
		const confirm = dialog.getByRole('button', { name: '삭제', exact: true });
		await page.route(actionUrl, (route) => route.fulfill(failed));
		await confirm.press('Enter');
		await expect(dialog.getByRole('alert')).toBeFocused();
		await page.unroute(actionUrl);
		await confirm.press('Enter');
		await expect(provider).toBeFocused();
		await expect(provider).toHaveValue('JIRA');
		await expect(
			main.getByRole('status').filter({ hasText: '설정이 제거되었습니다' })
		).toBeVisible();
	});

	for (const locale of ['ko', 'en'])
		for (const theme of ['light', 'dark'])
			for (const width of [375, 768, 1440]) {
				test(`${locale}/${theme}/${width}: labeled controls for all providers`, async ({
					page
				}) => {
					await page.setViewportSize({ width, height: 850 });
					await page.goto(path());
					await page.waitForLoadState('networkidle');
					if (locale === 'en') {
						await page.getByRole('button', { name: '언어 변경' }).click();
						await page.getByRole('menuitem', { name: 'English' }).click();
						await expect(page.locator('html')).toHaveAttribute('lang', 'en');
						await page.waitForLoadState('networkidle');
					}
					if (
						(await page.locator('html').evaluate((el) => el.classList.contains('dark'))) !==
						(theme === 'dark')
					)
						await page.getByRole('button', { name: /테마 변경|Toggle theme/ }).click();
					const main = page.getByRole('main');
					const provider = main.getByRole('combobox', { name: /^(제공자|Provider)$/ });
					for (const item of ['JIRA', 'GITHUB', 'GITLAB', 'GITEA', 'CUSTOM']) {
						await provider.selectOption(item);
						await expect(main.getByLabel(/API 토큰|API Token/i)).toBeVisible();
						expect(await main.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
						const result = await new AxeBuilder({ page })
							.include('main')
							.withTags(['wcag2a', 'wcag2aa'])
							.analyze();
						expect(
							result.violations.filter(
								({ impact }) => impact === 'serious' || impact === 'critical'
							)
						).toEqual([]);
					}
				});
			}
});
