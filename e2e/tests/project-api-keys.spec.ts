import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures/auth.fixture';

const preview = 'tmk_ui_fixture_placeholder_not_a_real_key';

test.describe('Project API key settings', () => {
	let projectId: number;
	const path = () => `/projects/${projectId}/settings/api-keys`;
	const api = () => `/api/projects/${projectId}/api-keys`;

	test.beforeAll(async ({ request }) => {
		const result = await request.post('/api/projects', {
			data: { name: `API keys ${randomUUID()}` }
		});
		expect(result.ok()).toBe(true);
		projectId = (await result.json()).data.id;
	});

	test.afterAll(async ({ request }) => {
		if (!projectId) return;
		const result = await request.get(api());
		expect(result.ok()).toBe(true);
		for (const entry of await result.json()) {
			expect((await request.delete(api() + '/' + entry.id)).ok()).toBe(true);
		}
		expect((await request.delete(`/api/projects/${projectId}`)).ok()).toBe(true);
	});

	test('list, issue, clipboard and revoke failures can be retried without losing the key display', async ({
		page,
		request
	}) => {
		const keyName = 'Nightly CI key';
		const failure = { status: 503, json: { error: 'Fixture unavailable' } };
		const listUrl = '**' + api();
		await page.setViewportSize({ width: 375, height: 850 });
		await page.addInitScript(() => {
			Object.defineProperty(navigator, 'clipboard', {
				configurable: true,
				value: { writeText: () => Promise.reject(new Error('Clipboard denied')) }
			});
		});
		await page.route(listUrl, (route) => route.fulfill(failure));
		await page.goto(path());
		await page.waitForLoadState('networkidle');
		const main = page.getByRole('main');
		const panel = main.getByRole('region', { name: 'API 키' });
		await expect(panel.getByRole('alert')).toContainText('목록을 불러오지 못했습니다');
		await expect(panel.getByText('아직 API 키가 없습니다', { exact: false })).toHaveCount(0);
		await page.unroute(listUrl);
		await panel.getByRole('button', { name: '다시 시도' }).press('Enter');
		await expect(panel).toBeFocused();
		await expect(panel.getByText('아직 API 키가 없습니다', { exact: false })).toBeVisible();

		const add = main.getByRole('button', { name: 'API 키 생성' });
		await add.press('Enter');
		const issue = page.getByRole('dialog', { name: '새 API 키 생성' });
		const name = issue.getByRole('textbox', { name: '키 이름' });
		await expect(name).toBeFocused();
		await name.fill('   ');
		await name.press('Enter');
		await expect(issue.getByRole('alert')).toBeFocused();
		await expect(name).toHaveAttribute('aria-invalid', 'true');
		await name.fill(keyName);
		await page.route(listUrl, (route) => route.fulfill(failure));
		await name.press('Enter');
		await expect(issue.getByRole('alert')).toContainText('저장하지 못했습니다');
		await expect(name).toHaveValue(keyName);
		await page.unroute(listUrl);
		await page.route(listUrl, async (route) => {
			const response = await route.fetch();
			const result = await response.json();
			await route.fulfill({ response, json: { ...result, key: preview } });
		});
		await name.press('Enter');

		const reveal = page.getByRole('dialog', { name: 'API 키가 생성되었습니다' });
		const value = reveal.getByRole('textbox', { name: 'API 키', exact: true });
		await expect(value).toBeFocused();
		await expect(value).toHaveValue(preview);
		await page.keyboard.press('Escape');
		await expect(reveal).toBeVisible();
		await reveal.getByRole('button', { name: '키 복사' }).press('Enter');
		await expect(value).toBeFocused();
		expect(await value.evaluate((field) => (field as HTMLTextAreaElement).selectionEnd)).toBe(
			preview.length
		);
		await expect(reveal.getByRole('status')).toHaveText('선택된 내용을 직접 복사해 주세요.');
		const agent = reveal.getByRole('combobox', { name: 'MCP 연결' });
		const configuration = reveal.getByRole('textbox', { name: '연결 설정', exact: true });
		await agent.selectOption('Cursor');
		expect(JSON.parse(await configuration.inputValue()).mcpServers).toBeTruthy();
		await reveal.getByRole('button', { name: '연결 설정 복사' }).press('Enter');
		await expect(configuration).toBeFocused();
		await expect(reveal.getByRole('status')).toContainText('직접 복사');

		await reveal.getByRole('button', { name: '닫기', exact: true }).press('Enter');
		await expect(
			reveal.getByText('이 창을 닫으면 키를 다시 확인할 수 없습니다.', { exact: true })
		).toBeFocused();
		await reveal.getByRole('button', { name: '키 계속 보기' }).press('Enter');
		await expect(value).toBeFocused();
		await page.evaluate(() => {
			navigator.clipboard.writeText = async () => {};
		});
		await reveal.getByRole('button', { name: '연결 설정 복사' }).press('Enter');
		await expect(reveal.getByRole('status')).toHaveText('명령어가 복사되었습니다!');
		await reveal.getByRole('button', { name: '닫기', exact: true }).press('Enter');
		await expect(reveal).toHaveCount(0);
		await expect(add).toBeFocused();
		await expect(page.getByRole('textbox', { name: 'API 키', exact: true })).toHaveCount(0);
		await page.unroute(listUrl);
		const metadata = await (await request.get(api())).json();
		const stored = metadata.find((key: { name: string }) => key.name === keyName);
		expect(stored).not.toHaveProperty('key');

		const revoke = panel.getByRole('button', { name: keyName + ' 폐기' });
		await revoke.press('Enter');
		const dialog = page.getByRole('alertdialog', { name: 'API 키 폐기' });
		await dialog.getByRole('button', { name: '취소' }).press('Enter');
		await expect(revoke).toBeFocused();
		await revoke.press('Enter');
		const revokeRoute = '**' + api() + '/' + stored.id;
		await page.route(revokeRoute, (route) => route.fulfill(failure));
		const confirm = dialog.getByRole('button', { name: '폐기', exact: true });
		await confirm.press('Enter');
		await expect(dialog.getByRole('alert')).toBeFocused();
		await expect(dialog).toContainText(keyName);
		await page.unroute(revokeRoute);
		await confirm.press('Enter');
		await expect(revoke).toHaveCount(0);
		await expect(add).toBeFocused();
	});

	for (const locale of ['ko', 'en'])
		for (const theme of ['light', 'dark'])
			for (const width of [375, 768, 1440]) {
				test(`${locale}/${theme}/${width}: issuing and revealing keys is accessible`, async ({
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
					await main
						.getByRole('button', { name: /^(API 키 생성|Generate API Key)$/i })
						.press('Enter');
					const modal = page.getByRole('dialog');
					const name = modal.getByRole('textbox', { name: /^(키 이름|Key Name)$/i });
					await expect(name).toBeFocused();
					await name.fill('LongCredentialName'.repeat(5));
					await page.route('**' + api(), (route) =>
						route.fulfill({
							status: 201,
							json: {
								id: 9999,
								key: preview,
								name: 'LongCredentialName'.repeat(5),
								prefix: 'tmk_ui',
								createdAt: '2026-01-02T12:00:00.000Z'
							}
						})
					);
					await name.press('Enter');
					await expect(modal.getByRole('textbox', { name: /^(API 키|API key)$/i })).toHaveValue(
						preview
					);
					expect(await modal.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
					const result = await new AxeBuilder({ page })
						.include('[data-slot=dialog-content]')
						.withTags(['wcag2a', 'wcag2aa'])
						.analyze();
					expect(
						result.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')
					).toEqual([]);
					await modal.getByRole('button', { name: /^(닫기|Close)$/i }).press('Enter');
					await modal
						.getByRole('button', { name: /키 표시 닫기|Close key display/i })
						.press('Enter');
					await expect(modal).toHaveCount(0);
				});
			}
});
