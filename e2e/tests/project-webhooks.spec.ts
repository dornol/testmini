import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures/auth.fixture';

const log = {
	id: 7,
	event: 'TEST',
	statusCode: 502,
	success: false,
	errorMessage: 'Sandbox rejected delivery',
	attempt: 2,
	duration: 1500,
	createdAt: '2026-01-02T12:00:00.000Z'
};

test.describe('Project webhook settings', () => {
	let projectId: number;
	let firstId: number;
	let secondId: number;
	const first = 'LongWebhookDestination'.repeat(4);
	const second = 'Second destination';
	const path = () => `/projects/${projectId}/settings/webhooks`;
	const api = () => `/api/projects/${projectId}/webhooks`;

	test.beforeAll(async ({ request }) => {
		const result = await request.post('/api/projects', {
			data: { name: `Webhooks ${randomUUID()}` }
		});
		expect(result.ok()).toBe(true);
		projectId = (await result.json()).data.id;
		const create = async (name: string) => {
			const webhook = await request.post(api(), {
				data: { name, url: 'https://example.com/receiver' }
			});
			expect(webhook.ok()).toBe(true);
			return (await webhook.json()).id;
		};
		firstId = await create(first);
		secondId = await create(second);
	});

	test.afterAll(async ({ request }) => {
		if (projectId) expect((await request.delete(`/api/projects/${projectId}`)).ok()).toBe(true);
	});

	test('logs distinguish network errors, empty results and failed deliveries without mixing destinations', async ({
		page
	}) => {
		await page.setViewportSize({ width: 375, height: 850 });
		await page.goto(path());
		await page.waitForLoadState('networkidle');
		const list = page.getByRole('list', { name: '웹훅' });
		const firstRow = list
			.getByRole('listitem')
			.filter({ has: page.getByRole('heading', { name: first, exact: true }) });
		const secondRow = list
			.getByRole('listitem')
			.filter({ has: page.getByRole('heading', { name: second, exact: true }) });
		const firstLogs = firstRow.getByRole('button', { name: '로그', exact: true });
		const secondLogs = secondRow.getByRole('button', { name: '로그', exact: true });
		const firstUrl = '**' + api() + '/' + firstId + '/logs';
		const secondUrl = '**' + api() + '/' + secondId + '/logs';

		await page.route(firstUrl, (route) => route.fulfill({ status: 503 }));
		await firstLogs.press('Enter');
		const firstPanel = firstRow.getByRole('region', { name: '전송 로그' });
		await expect(firstPanel.getByRole('alert')).toHaveText('전송 로그를 불러오지 못했습니다.');
		await expect(firstPanel.getByText('전송 로그가 없습니다')).toHaveCount(0);
		await page.unroute(firstUrl);
		await firstPanel.getByRole('button', { name: '다시 시도' }).press('Enter');
		await expect(firstPanel.getByRole('heading')).toBeFocused();
		await expect(firstPanel.getByText('전송 로그가 없습니다')).toBeVisible();
		await firstLogs.press('Enter');
		await expect(firstLogs).toHaveAttribute('aria-expanded', 'false');

		let finishFirst!: () => void;
		const slow = new Promise<void>((resolve) => {
			finishFirst = resolve;
		});
		await page.route(firstUrl, async (route) => {
			await slow;
			await route
				.fulfill({ json: [{ ...log, errorMessage: 'Stale record from first destination' }] })
				.catch(() => {});
		});
		const requested = page.waitForRequest((request) =>
			request.url().endsWith('/' + firstId + '/logs')
		);
		await firstLogs.press('Enter');
		await requested;
		await expect(firstPanel.getByRole('status')).toBeVisible();

		await page.route(secondUrl, (route) => route.fulfill({ json: [log] }));
		await secondLogs.press('Enter');
		finishFirst();
		const secondPanel = secondRow.getByRole('region', { name: '전송 로그' });
		await expect(secondPanel.getByText('Sandbox rejected delivery')).toBeVisible();
		await expect(secondPanel.getByText('실패 502')).toBeVisible();
		await expect(secondPanel.getByText('Stale record from first destination')).toHaveCount(0);
		await expect(firstPanel).toHaveCount(0);
		await expect(secondLogs).toHaveAttribute('aria-expanded', 'true');
	});

	test('create, toggle, test and delete can recover from failed requests', async ({
		page,
		request
	}) => {
		await page.setViewportSize({ width: 375, height: 850 });
		await page.goto(path());
		await page.waitForLoadState('networkidle');
		const main = page.getByRole('main');
		const open = main.getByRole('button', { name: '웹훅 추가' });
		await open.press('Enter');
		const form = main.getByRole('form', { name: '웹훅 추가' });
		const name = form.getByRole('textbox', { name: '이름' });
		const hookName = 'Retry fixture';
		const destination = 'https://example.com/receiver';
		const failure = { status: 503, json: { error: 'Fixture unavailable' } };
		await expect(name).toBeFocused();
		await name.fill(hookName);
		await form.getByRole('textbox', { name: 'URL' }).fill(destination);
		await form.getByLabel('시크릿').fill('synthetic-webhook-secret');
		const event = form.getByRole('checkbox', { name: '테스트 실패' });
		await event.check();
		const createUrl = '**' + api();
		await page.route(createUrl, (route) => route.fulfill(failure));
		const submit = form.getByRole('button', { name: '웹훅 추가' });
		await submit.press('Enter');
		await expect(form.getByRole('alert')).toBeFocused();
		await expect(name).toHaveValue(hookName);
		await expect(event).toBeChecked();
		await expect(form.getByLabel('시크릿')).toHaveValue('synthetic-webhook-secret');
		await page.unroute(createUrl);
		await submit.press('Enter');
		const row = main
			.getByRole('listitem')
			.filter({ has: page.getByRole('heading', { name: hookName, exact: true }) });
		await expect(row).toBeVisible();
		await expect(open).toBeFocused();
		const hooks = await request.get(api());
		const id = (await hooks.json()).find((entry: { name: string }) => entry.name === hookName).id;
		const detail = '**' + api() + '/' + id;
		const toggle = row.getByRole('switch', { name: '활성화' });
		const testAction = row.getByRole('button', { name: '테스트', exact: true });
		await page.route(detail, (route) => route.fulfill(failure));
		await toggle.press('Enter');
		await expect(row.getByRole('alert')).toBeVisible();
		await expect(toggle).toHaveAttribute('aria-checked', 'true');
		await page.unroute(detail);
		await toggle.press('Enter');
		await expect(toggle).toHaveAttribute('aria-checked', 'false');
		await expect(testAction).toBeDisabled();
		await toggle.press('Enter');
		await expect(toggle).toHaveAttribute('aria-checked', 'true');

		await page.route(detail + '/test', (route) => route.fulfill(failure));
		await testAction.press('Enter');
		await expect(row.getByRole('alert')).toContainText('테스트 요청에 실패했습니다');
		await page.unroute(detail + '/test');
		await page.route(detail + '/test', (route) => route.fulfill({ json: { success: true } }));
		await page.route(detail + '/logs', (route) => route.fulfill({ json: [log] }));
		await testAction.press('Enter');
		await expect(
			row.getByRole('status').filter({ hasText: '테스트 요청을 처리했습니다' })
		).toBeVisible();
		await expect(row.getByText('실패 502')).toBeVisible();

		const remove = row.getByRole('button', { name: hookName + ' 삭제' });
		await remove.press('Enter');
		const dialog = page.getByRole('alertdialog', { name: '웹훅 삭제' });
		await dialog.getByRole('button', { name: '취소' }).press('Enter');
		await expect(remove).toBeFocused();
		await remove.press('Enter');
		await page.route(detail, (route) => route.fulfill(failure));
		const confirm = dialog.getByRole('button', { name: '삭제', exact: true });
		await confirm.press('Enter');
		await expect(dialog.getByRole('alert')).toBeFocused();
		await expect(dialog).toContainText(hookName);
		await page.unroute(detail);
		await confirm.press('Enter');
		await expect(remove).toHaveCount(0);
		await expect(open).toBeFocused();
	});

	for (const locale of ['ko', 'en'])
		for (const theme of ['light', 'dark'])
			for (const width of [375, 768, 1440]) {
				test(`${locale}/${theme}/${width}: webhook list, logs and form fit`, async ({ page }) => {
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
					const row = main
						.getByRole('listitem')
						.filter({ has: page.getByRole('heading', { name: first, exact: true }) });
					await page.route('**' + api() + '/' + firstId + '/logs', (route) =>
						route.fulfill({ json: [log] })
					);
					await row.getByRole('button', { name: /^(로그|Logs)$/ }).press('Enter');
					await expect(row.getByText('Sandbox rejected delivery')).toBeVisible();
					await main.getByRole('button', { name: /^(웹훅 추가|Add Webhook)$/i }).press('Enter');
					await expect(main.getByRole('form')).toBeVisible();
					expect(await main.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
					const result = await new AxeBuilder({ page })
						.include('main')
						.withTags(['wcag2a', 'wcag2aa'])
						.analyze();
					expect(
						result.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')
					).toEqual([]);
				});
			}
});
