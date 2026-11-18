import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures/auth.fixture';

const catalogs = [
	{ route: 'tags', ko: '태그', en: 'Tags', add: '태그 추가', name: '태그 이름' },
	{
		route: 'priorities',
		ko: '우선순위',
		en: 'Priorities',
		add: '우선순위 추가',
		name: '우선순위 이름'
	},
	{ route: 'environments', ko: '환경', en: 'Environments', add: '환경 추가', name: '환경 이름' }
];

test.describe('Project setting catalogs', () => {
	let projectId: number;
	const path = (route: string) => `/projects/${projectId}/settings/${route}`;

	test.beforeAll(async ({ request }) => {
		const response = await request.post('/api/projects', {
			data: { name: `Catalogs ${randomUUID()}` }
		});
		expect(response.ok()).toBe(true);
		projectId = (await response.json()).data.id;
	});

	test.afterAll(async ({ request }) => {
		if (projectId) expect((await request.delete(`/api/projects/${projectId}`)).ok()).toBe(true);
	});

	for (const catalog of catalogs) {
		test(`${catalog.route} keeps input and supports retry after failed add, edit and delete`, async ({
			page
		}) => {
			const url = path(catalog.route);
			const originalName = 'Catalog ' + catalog.route;
			const editedName = originalName + ' edited';
			const failure = {
				status: 503,
				json: { type: 'error', status: 503, error: { message: 'Unavailable' } }
			};
			await page.setViewportSize({ width: 375, height: 850 });
			await page.goto(url);
			await page.waitForLoadState('networkidle');
			const main = page.getByRole('main');
			const create = main.locator('form[action="?/create"]');
			const newName = create.getByRole('textbox', { name: catalog.name });
			const createButton = create.getByRole('button', { name: catalog.add, exact: true });
			await newName.fill('   ');
			await createButton.press('Enter');
			await expect(create.getByRole('alert')).toHaveText('이름을 입력하세요.');
			await newName.fill(originalName);
			const color = create.getByRole('radio', { checked: true });
			const defaultColor = await color.getAttribute('value');
			await color.focus();
			await color.press('ArrowRight');
			const selected = await create.getByRole('radio', { checked: true }).getAttribute('value');
			expect(selected).not.toBeNull();
			expect(selected).not.toBe(defaultColor);
			if (catalog.route !== 'tags') await create.getByRole('checkbox').check();
			const memo = 'Open the sandbox.\nUse the test account.';
			if (catalog.route === 'environments') {
				await create.getByRole('textbox', { name: '사이트 주소' }).fill('https://qa.example.com');
				await create.getByRole('textbox', { name: '비고' }).fill(memo);
			}
			const createAction = '**' + url + '?/create';
			await page.route(createAction, (route) => route.fulfill(failure));
			await createButton.press('Enter');
			await expect(create.getByRole('alert')).toBeFocused();
			await expect(newName).toHaveValue(originalName);
			await expect(create.getByRole('radio', { checked: true })).toHaveValue(selected!);
			await page.unroute(createAction);
			await createButton.press('Enter');
			const list = main.getByRole('list', { name: catalog.ko, exact: true });
			const row = list.getByRole('listitem').filter({ hasText: originalName });
			await expect(row).toBeVisible();
			await expect(newName).toBeFocused();
			await expect(newName).toHaveValue('');
			await expect(color).toHaveValue(defaultColor!);
			if (catalog.route === 'environments') {
				await row.locator('summary').press('Enter');
				await expect(row.getByText('https://qa.example.com')).toBeVisible();
				expect(await row.locator('dd').last().textContent()).toBe(memo);
			}
			await newName.fill(originalName);
			await createButton.press('Enter');
			await expect(create.getByRole('alert')).toContainText('이미 존재합니다');
			await expect(newName).toHaveAttribute('aria-invalid', 'true');

			await row.getByRole('button', { name: originalName + ' 수정' }).press('Enter');
			const update = main.locator('form[action="?/update"]');
			const edit = update.getByRole('textbox', { name: catalog.name });
			await expect(edit).toBeFocused();
			await edit.fill(editedName);
			const updateAction = '**' + url + '?/update';
			await page.route(updateAction, (route) => route.fulfill(failure));
			const save = update.getByRole('button', { name: '변경사항 저장' });
			await save.press('Enter');
			await expect(update.getByRole('alert')).toBeFocused();
			await expect(edit).toHaveValue(editedName);
			await page.unroute(updateAction);
			await save.press('Enter');
			await expect(list.getByRole('button', { name: editedName + ' 수정' })).toBeFocused();

			const remove = list.getByRole('button', { name: editedName + ' 삭제' });
			await remove.press('Enter');
			const confirmation = page.getByRole('alertdialog');
			await expect(confirmation).toContainText(editedName);
			await confirmation.getByRole('button', { name: '취소' }).press('Enter');
			await expect(remove).toBeFocused();
			await remove.press('Enter');
			const deleteAction = '**' + url + '?/delete';
			await page.route(deleteAction, (route) => route.fulfill(failure));
			const confirm = confirmation.getByRole('button', { name: '삭제', exact: true });
			await confirm.press('Enter');
			await expect(confirmation.getByRole('alert')).toBeFocused();
			await expect(confirmation).toContainText(editedName);
			await page.unroute(deleteAction);
			await confirm.press('Enter');
			await expect(remove).toHaveCount(0);
			await expect(newName).toBeFocused();
		});
	}

	for (const locale of ['ko', 'en'])
		for (const theme of ['light', 'dark'])
			for (const width of [375, 768, 1440]) {
				test(`${locale}/${theme}/${width}: all catalog forms fit and have accessible labels`, async ({
					page
				}) => {
					await page.setViewportSize({ width, height: 850 });
					await page.goto(path(catalogs[0].route));
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
					for (const catalog of catalogs) {
						if (catalog.route !== catalogs[0].route)
							await main
								.getByRole('navigation', { name: /^(설정|Settings)$/ })
								.getByRole('link', { name: locale === 'ko' ? catalog.ko : catalog.en, exact: true })
								.click();
						await expect(
							main.getByRole('heading', {
								name: locale === 'ko' ? catalog.ko : catalog.en,
								exact: true
							})
						).toBeVisible();
						expect(await main.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
						const audit = await new AxeBuilder({ page })
							.include('main')
							.withTags(['wcag2a', 'wcag2aa'])
							.analyze();
						expect(
							audit.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')
						).toEqual([]);
					}
				});
			}
});
