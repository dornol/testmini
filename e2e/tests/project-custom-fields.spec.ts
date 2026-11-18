import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures/auth.fixture';

test.describe('Project custom fields', () => {
	let projectId: number;
	const api = () => `/api/projects/${projectId}/custom-fields`;
	const settings = () => `/projects/${projectId}/settings/custom-fields`;
	const longName = 'BrowserCompatibility'.repeat(5);

	test.beforeAll(async ({ request }) => {
		const project = await request.post('/api/projects', {
			data: { name: `Custom fields ${randomUUID()}` }
		});
		expect(project.ok()).toBe(true);
		projectId = (await project.json()).data.id;
		const fixture = await request.post(api(), { data: { name: longName, fieldType: 'TEXT' } });
		expect(fixture.ok()).toBe(true);
	});

	test.afterAll(async ({ request }) => {
		if (projectId) expect((await request.delete(`/api/projects/${projectId}`)).ok()).toBe(true);
	});

	test('validates option fields and recovers create, update and delete without dropping data', async ({
		page,
		request
	}) => {
		const draftName = 'Browser profile';
		const updatedName = 'Supported browser profile';
		const draftOptions = 'Firefox\nChromium';
		const updatedOptions = 'Chromium\nSafari';
		const unavailable = { status: 503, json: { error: 'Unavailable' } };
		await page.setViewportSize({ width: 375, height: 850 });
		await page.goto(settings());
		await page.waitForLoadState('networkidle');

		const main = page.getByRole('main');
		const create = main.getByRole('form', { name: '필드 추가' });
		const name = create.getByRole('textbox', { name: '필드 이름' });
		const type = create.getByRole('combobox', { name: '필드 유형' });
		const options = create.getByRole('textbox', { name: /옵션/ });
		const add = create.getByRole('button', { name: '필드 추가' });
		await expect(type.locator('option')).toHaveCount(7);
		await name.fill(draftName);
		for (const fieldType of [
			'SELECT',
			'MULTISELECT',
			'NUMBER',
			'TEXT',
			'DATE',
			'CHECKBOX',
			'URL'
		]) {
			await type.selectOption(fieldType);
			await expect(options).toHaveCount(['SELECT', 'MULTISELECT'].includes(fieldType) ? 1 : 0);
		}
		await type.selectOption('SELECT');
		await add.press('Enter');
		await expect(create.getByRole('alert')).toBeFocused();
		await expect(create.getByRole('alert')).toContainText('하나 이상');
		await options.fill('Firefox\nfirefox');
		await add.press('Enter');
		await expect(create.getByRole('alert')).toContainText('한 번만');
		await expect(options).toHaveAttribute('aria-invalid', 'true');

		await options.fill(draftOptions);
		await create.getByRole('checkbox').check();
		const creation = '**' + api();
		await page.route(creation, (route) => route.fulfill(unavailable));
		await add.press('Enter');
		await expect(create.getByRole('alert')).toBeFocused();
		await expect(options).toHaveValue(draftOptions);
		await expect(type).toHaveValue('SELECT');
		await expect(create.getByRole('checkbox')).toBeChecked();
		await page.unroute(creation);
		await add.press('Enter');
		const fields = main.getByRole('list', { name: '커스텀 필드' });
		const edit = fields.getByRole('button', { name: draftName + ' 수정' });
		await expect(edit).toBeVisible();
		await expect(name).toBeFocused();
		await expect(name).toHaveValue('');

		const definitions = await request.get(api());
		const id = (await definitions.json()).find(
			(field: { name: string }) => field.name === draftName
		).id;
		const casePage = await page.context().newPage();
		await casePage.goto(`/projects/${projectId}/test-cases/new`);
		await casePage.waitForLoadState('networkidle');
		await casePage.locator('#title').fill('Case with existing custom field selection');
		await casePage.locator('#cf-' + id).click();
		await casePage.getByRole('option', { name: 'Firefox', exact: true }).click();
		await casePage.getByRole('button', { name: '테스트 케이스 만들기' }).click();
		await casePage.waitForURL(/\/test-cases\/\d+$/);
		const caseId = new URL(casePage.url()).pathname.split('/').at(-1);
		await casePage.close();

		await name.fill('Keep the unsaved new-field draft');
		await edit.press('Enter');
		const update = main.getByRole('form', { name: '필드 수정' });
		const updateName = update.getByRole('textbox', { name: '필드 이름' });
		const updateOptions = update.getByRole('textbox', { name: /옵션/ });
		await expect(updateName).toBeFocused();
		await expect(updateOptions).toHaveValue(draftOptions);
		await expect(update.getByRole('combobox')).toHaveCount(0);
		await updateName.fill(updatedName);
		await updateOptions.fill(updatedOptions);
		const save = update.getByRole('button', { name: '변경사항 저장' });
		const detailApi = api() + '/' + id;
		await page.route('**' + detailApi, (route) => route.fulfill(unavailable));
		await save.press('Enter');
		await expect(update.getByRole('alert')).toBeFocused();
		await expect(updateOptions).toHaveValue(updatedOptions);
		await page.unroute('**' + detailApi);
		await save.press('Enter');
		await expect(fields.getByRole('button', { name: updatedName + ' 수정' })).toBeFocused();
		await expect(name).toHaveValue('Keep the unsaved new-field draft');

		const caseResponse = await request.get(`/api/projects/${projectId}/test-cases/${caseId}`);
		expect((await caseResponse.json()).testCase.latestVersion.customFields[id]).toBe('Firefox');

		const remove = fields.getByRole('button', { name: updatedName + ' 삭제' });
		await remove.press('Enter');
		const dialog = page.getByRole('alertdialog', { name: '커스텀 필드 삭제' });
		await dialog.getByRole('button', { name: '취소' }).press('Enter');
		await expect(remove).toBeFocused();
		await remove.press('Enter');
		await page.route('**' + detailApi, (route) => route.fulfill(unavailable));
		const confirm = dialog.getByRole('button', { name: '삭제', exact: true });
		await confirm.press('Enter');
		await expect(dialog.getByRole('alert')).toBeFocused();
		await expect(dialog).toContainText(updatedName);
		await page.unroute('**' + detailApi);
		await confirm.press('Enter');
		await expect(remove).toHaveCount(0);
		await expect(name).toBeFocused();
		const afterDelete = await request.get(`/api/projects/${projectId}/test-cases/${caseId}`);
		expect((await afterDelete.json()).testCase.latestVersion.customFields[id]).toBe('Firefox');
	});

	for (const locale of ['ko', 'en'])
		for (const theme of ['light', 'dark'])
			for (const width of [375, 768, 1440]) {
				test(`${locale}/${theme}/${width}: field names and option forms stay readable`, async ({
					page
				}) => {
					await page.setViewportSize({ width, height: 850 });
					await page.goto(settings());
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
						.getByRole('combobox', { name: /필드 유형|Field Type/i })
						.selectOption('MULTISELECT');
					await expect(main.getByRole('textbox', { name: /옵션|Options/i })).toBeVisible();
					await expect(main.getByText(longName, { exact: true })).toBeVisible();
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
