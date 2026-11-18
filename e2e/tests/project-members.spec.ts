import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures/auth.fixture';

test.describe.serial('Project member settings', () => {
	const key = randomUUID();
	const name = 'Member' + 'LongIdentifier'.repeat(4);
	const email = `member-${key}@example.com`;
	const password = randomUUID();
	let memberId: string;
	let projectId: number;
	const path = () => `/projects/${projectId}/settings/members`;

	test.beforeAll(async ({ request, baseURL }) => {
		const project = await request.post('/api/projects', { data: { name: `Members ${key}` } });
		expect(project.ok()).toBe(true);
		projectId = (await project.json()).data.id;
		const user = await request.post('/api/auth/admin/create-user', {
			data: { email, password, name, role: 'user' },
			headers: { origin: baseURL! }
		});
		expect(user.ok()).toBe(true);
		memberId = (await user.json()).user.id;
	});

	test.afterAll(async ({ request, baseURL }) => {
		if (projectId) expect((await request.delete(`/api/projects/${projectId}`)).ok()).toBe(true);
		if (memberId)
			expect(
				(
					await request.post('/api/auth/admin/remove-user', {
						data: { userId: memberId },
						headers: { origin: baseURL! }
					})
				).ok()
			).toBe(true);
	});

	test('search, add, change role and remove can recover from failed requests', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 850 });
		await page.goto(path());
		await page.waitForLoadState('networkidle');
		const main = page.getByRole('main');
		const add = main.getByRole('button', { name: '멤버 추가', exact: true });
		await add.press('Enter');
		const addDialog = page.getByRole('dialog', { name: '멤버 추가' });
		const search = addDialog.getByLabel('사용자 검색');
		await expect(search).toBeFocused();

		const searchRoute = '**/api/users/search?*';
		await page.route(searchRoute, (route) => route.fulfill({ status: 503 }));
		await search.fill(email);
		await expect(addDialog.getByRole('alert')).toContainText('검색하지 못했습니다');
		await page.unroute(searchRoute);
		await addDialog.getByRole('button', { name: '다시 시도' }).press('Enter');
		await expect(search).toHaveValue(email);
		const result = addDialog.getByRole('button', { name: new RegExp(email) });
		await result.press('Enter');
		const newRole = addDialog.getByRole('combobox', { name: '역할' });
		await expect(newRole).toBeFocused();
		const addAction = '**' + path() + '?/addMember';
		const failure = {
			status: 503,
			json: { type: 'error', status: 503, error: { message: 'Unavailable' } }
		};
		await page.route(addAction, (route) => route.fulfill(failure));
		const submitAdd = addDialog.getByRole('button', { name: '멤버 추가' });
		await submitAdd.press('Enter');
		await expect(addDialog.getByRole('alert')).toBeFocused();
		await expect(addDialog.getByText(email, { exact: true })).toBeVisible();
		await expect(newRole).toHaveValue('QA');
		await page.unroute(addAction);
		await submitAdd.press('Enter');
		await expect(add).toBeFocused();

		const role = main.getByRole('combobox', { name: `${name}의 역할` });
		const roleDialog = page.getByRole('alertdialog', { name: '역할 변경 확인' });
		const chooseDeveloper = async () => {
			await role.selectOption('DEV');
			await expect(roleDialog).toContainText(name);
		};
		await chooseDeveloper();
		await roleDialog.getByRole('button', { name: '취소' }).press('Enter');
		await expect(role).toBeFocused();
		await expect(role).toHaveValue('QA');
		await chooseDeveloper();
		const roleAction = '**' + path() + '?/updateRole';
		await page.route(roleAction, (route) => route.fulfill(failure));
		const submitRole = roleDialog.getByRole('button', { name: '역할 변경' });
		await submitRole.press('Enter');
		await expect(roleDialog.getByRole('alert')).toBeFocused();
		await page.unroute(roleAction);
		await submitRole.press('Enter');
		await expect(role).toHaveValue('DEV');
		await expect(role).toBeFocused();

		const remove = main.getByRole('button', { name: `${name} 제거` });
		await remove.press('Enter');
		const removeDialog = page.getByRole('alertdialog', { name: '멤버 제거' });
		const removeAction = '**' + path() + '?/removeMember';
		await page.route(removeAction, (route) => route.fulfill(failure));
		const submitRemove = removeDialog.getByRole('button', { name: '제거', exact: true });
		await submitRemove.press('Enter');
		await expect(removeDialog.getByRole('alert')).toBeFocused();
		await expect(removeDialog).toContainText(name);
		await page.unroute(removeAction);
		await submitRemove.press('Enter');
		await expect(remove).toHaveCount(0);
		await expect(add).toBeFocused();
	});

	test('VIEWER can read member data and cannot open mutation controls or submit add', async ({
		request,
		browser,
		baseURL
	}) => {
		const response = await request.post(path() + '?/addMember', {
			form: { userId: memberId, role: 'VIEWER' },
			headers: { 'x-sveltekit-action': 'true', accept: 'application/json', origin: baseURL! }
		});
		expect(response.ok()).toBe(true);
		const viewer = await browser.newContext({ baseURL, viewport: { width: 375, height: 850 } });
		try {
			expect(
				(
					await viewer.request.post('/api/auth/sign-in/email', {
						data: { email, password },
						headers: { origin: baseURL! }
					})
				).ok()
			).toBe(true);
			const page = await viewer.newPage();
			await page.goto(path());
			const main = page.getByRole('main');
			await expect(main.getByRole('table', { name: '멤버' }).getByText(email)).toBeVisible();
			await expect(main.getByRole('combobox')).toHaveCount(0);
			await expect(main.getByRole('button', { name: '멤버 추가' })).toHaveCount(0);
			await expect(main.getByRole('button', { name: /제거$/ })).toHaveCount(0);
			const denied = await viewer.request.post(path() + '?/addMember', {
				form: { userId: memberId, role: 'QA' },
				headers: { 'x-sveltekit-action': 'true', accept: 'application/json', origin: baseURL! }
			});
			expect(denied.status()).toBe(403);
		} finally {
			await viewer.close();
		}
	});

	for (const locale of ['ko', 'en'])
		for (const theme of ['light', 'dark'])
			for (const width of [375, 768, 1440]) {
				test(`${locale}/${theme}/${width}: names, roles and search fit the viewport`, async ({
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
					const list = main.getByRole('table', {
						name: /^(멤버|Members)$/
					});
					await expect(list.getByText(email, { exact: true })).toBeVisible();
					expect(await main.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
					for (const selector of ['main', '[data-slot=dialog-content]']) {
						if (selector !== 'main')
							await main.getByRole('button', { name: /^(멤버 추가|Add Member)$/i }).press('Enter');
						const result = await new AxeBuilder({ page })
							.include(selector)
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
