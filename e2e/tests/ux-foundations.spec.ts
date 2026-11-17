import { expect, test } from '../fixtures/auth.fixture';
import AxeBuilder from '@axe-core/playwright';

test.describe.serial('Test-case UX foundations', () => {
	let projectId: string;

	test('create a project for the UX scenarios', async ({ page }) => {
		await page.goto('/projects/new');
		await page.fill('#name', `UX Foundations ${Date.now()}`);
		await page.locator('button[type="submit"]').click();
		await page.waitForURL(/\/projects\/\d+$/);
		projectId = page.url().match(/\/projects\/(\d+)$/)![1];
	});

	test('invalid submit keeps input and offers a focused, linked error summary', async ({
		page
	}) => {
		await page.goto(`/projects/${projectId}/test-cases/new`);
		await page.waitForLoadState('networkidle');
		await page.locator('#precondition').fill('Keep this input after validation');
		await page.locator('form button[type="submit"]').click();
		const summary = page.locator('[data-slot="form-error-summary"]');
		await expect(summary).toBeVisible();
		await expect(summary).toContainText('제목을 입력해 주세요.');
		await expect(summary).toBeFocused();
		await expect(page.locator('#title')).toHaveAttribute('aria-invalid', 'true');
		await expect(page.locator('#title-error')).toBeVisible();
		await summary.getByRole('link').first().click();
		await expect(page.locator('#title')).toBeFocused();
		await expect(page.locator('#precondition')).toHaveValue('Keep this input after validation');
		await page.locator('#title').fill('Nested step validation');
		await page.getByRole('button', { name: /단계 추가|Add Step/ }).click();
		await page.locator('form button[type="submit"]').click();
		await expect(summary).toBeFocused();
		await expect(page.locator('#step-action-0')).toHaveAttribute('aria-invalid', 'true');
		await expect(summary).toContainText('이 단계의 동작을 입력해 주세요.');
		await summary.getByRole('link').first().click();
		await expect(page.locator('#step-action-0')).toBeFocused();
	});

	test('step buttons are named and keyboard reordering preserves the content', async ({ page }) => {
		await page.goto(`/projects/${projectId}/test-cases/new`);
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: /단계 추가|Add Step/ }).click();
		await page.locator('#step-action-0').fill('First action');
		await page.getByRole('button', { name: /단계 추가|Add Step/ }).click();
		await page.locator('#step-action-1').fill('Second action');
		const move = page.getByRole('button', { name: /2단계 위로 이동|Move step 2 up/ });
		await move.focus();
		await page.keyboard.press('Enter');
		await expect(page.locator('#step-action-0')).toHaveValue('Second action');
		await expect(page.locator('#step-action-1')).toHaveValue('First action');
	});

	test('detail sheet validates before saving and restores focus when closed', async ({ page }) => {
		await page.goto(`/projects/${projectId}/test-cases/new`);
		await page.waitForLoadState('networkidle');
		await page.locator('#title').fill('UX sheet validation');
		await page.locator('form button[type="submit"]').click();
		await page.waitForURL(/\/test-cases\/\d+$/);
		await page.goto(`/projects/${projectId}/test-cases`);
		await page.waitForLoadState('networkidle');
		const trigger = page.getByRole('button', { name: 'UX sheet validation', exact: true });
		await trigger.click();
		const sheet = page.getByRole('dialog', { name: /테스트 케이스|Test Cases/ });
		await expect(sheet).toBeVisible();
		await sheet
			.getByRole('button', { name: /수정|Edit/, exact: true })
			.first()
			.click();
		await page.locator('#detail-title').fill('');
		await sheet.getByRole('button', { name: /변경사항 저장|변경 사항 저장|Save Changes/ }).click();
		await expect(sheet.locator('[data-slot="form-error-summary"]')).toBeFocused();
		await expect(page.locator('#detail-title')).toHaveAttribute('aria-invalid', 'true');
		await sheet.locator('a[href="#detail-title"]').click();
		await expect(page.locator('#detail-title')).toBeFocused();
		await page.keyboard.press('Escape');
		await expect(sheet).not.toBeVisible();
		await expect(trigger).toBeFocused();
	});

	test('failed detail loading stays open and can be retried', async ({ page }) => {
		await page.goto(`/projects/${projectId}/test-cases`);
		await page.waitForLoadState('networkidle');
		await page.route(
			`**/api/projects/${projectId}/test-cases/*`,
			(route) => route.fulfill({ status: 503, json: { error: 'Temporarily unavailable' } }),
			{ times: 1 }
		);
		await page.getByRole('button', { name: 'UX sheet validation', exact: true }).click();
		const sheet = page.getByRole('dialog', { name: /테스트 케이스|Test Cases/ });
		await expect(
			sheet.getByRole('heading', { name: /화면을 불러오지 못했습니다|Unable to load this page/ })
		).toBeVisible();
		await sheet.getByRole('button', { name: /다시 시도|Try again/ }).click();
		await expect(sheet.getByRole('heading', { name: 'UX sheet validation' })).toBeVisible();
		await page.keyboard.press('Escape');
	});

	test('duplicate automation keys show a linked error and retain the form', async ({ page }) => {
		await page.goto(`/projects/${projectId}/test-cases/new`);
		await page.waitForLoadState('networkidle');
		await page.locator('#title').fill('Automation key original');
		await page.locator('#automationKey').fill('UX-AUTO-KEY');
		await page.locator('form button[type="submit"]').click();
		await page.waitForURL(/\/test-cases\/\d+$/);
		await page.goto(`/projects/${projectId}/test-cases/new`);
		await page.waitForLoadState('networkidle');
		await page.locator('#title').fill('Keep this duplicate draft');
		await page.locator('#automationKey').fill('UX-AUTO-KEY');
		await page.locator('form button[type="submit"]').click();
		const summary = page.locator('[data-slot="form-error-summary"]');
		await expect(summary).toContainText('이미 사용 중인 자동화 키입니다.');
		await expect(page.locator('#automationKey')).toHaveAttribute('aria-invalid', 'true');
		await expect(page.locator('#title')).toHaveValue('Keep this duplicate draft');
		await summary.locator('a[href="#automationKey"]').click();
		await expect(page.locator('#automationKey')).toBeFocused();
	});

	test('English controls work in landscape with reduced motion', async ({ page }) => {
		await page.setViewportSize({ width: 812, height: 375 });
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto(`/projects/${projectId}/test-cases/new`);
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: '언어 변경' }).click();
		await page.getByRole('menuitem', { name: 'English' }).click();
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
		await page.waitForLoadState('networkidle');
		await expect(page.getByLabel('Priority', { exact: true })).toBeVisible();
		await page.locator('form button[type="submit"]').click();
		await expect(page.getByRole('heading', { name: 'Check the following fields' })).toBeVisible();
		await expect(page.locator('[data-slot="form-error-summary"]')).toContainText('Enter a title.');
		await expect(page.locator('[data-slot="form-error-summary"]')).toBeFocused();
		expect(await page.locator('main').evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
			false
		);
	});

	for (const width of [375, 768, 1440]) {
		test(`${width}px: creation and list remain usable in both themes`, async ({ page }) => {
			await page.setViewportSize({ width, height: 1000 });
			for (const route of ['test-cases/new', 'test-cases']) {
				await page.goto(`/projects/${projectId}/${route}`);
				await page.waitForLoadState('networkidle');
				for (const dark of [false, true]) {
					const isDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
					if (isDark !== dark)
						await page.getByRole('button', { name: /테마 변경|Toggle theme/ }).click();
					await expect(page.locator('html')).toHaveClass(dark ? /dark/ : /^$/);
					const overflow = await page
						.locator('main')
						.evaluate((el) => el.scrollWidth > el.clientWidth);
					expect(overflow, `${route}, dark=${dark}`).toBe(false);
					if (route.endsWith('/new') && dark) {
						await page.locator('form button[type="submit"]').click();
						await expect(page.locator('[data-slot="form-error-summary"]')).toBeVisible();
					}
					const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
					expect(
						result.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
					).toEqual([]);
				}
			}
		});
	}
});
