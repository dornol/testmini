import { test, expect } from '../fixtures/auth.fixture';
import AxeBuilder from '@axe-core/playwright';

/**
 * Project settings E2E tests.
 *
 * Uses the standard auth fixture (global-setup registers a user, saves storage
 * state to ./e2e/.auth-storage.json). The fixture reuses that state so the
 * user is already authenticated when each test begins.
 *
 * Because creating a project is a prerequisite for all settings tests, the
 * suite is run serially and shares a project URL across tests.
 */

test.describe.serial('Project Settings', () => {
	const projectName = `Settings Project ${Date.now()}`;
	const updatedName = `Updated Settings Project ${Date.now()}`;
	let projectUrl: string;
	let projectId: string;
	test.afterAll(async ({ request }) => {
		if (projectId) expect((await request.delete(`/api/projects/${projectId}`)).ok()).toBe(true);
	});

	// -------------------------------------------------------------------------
	// Helper: derive the settings base URL once projectUrl is known
	// -------------------------------------------------------------------------

	function settingsUrl(sub = ''): string {
		// projectUrl looks like http://localhost:5173/projects/42
		return projectUrl + '/settings' + (sub ? `/${sub}` : '');
	}

	// -------------------------------------------------------------------------
	// 1. Create a project to use throughout this suite
	// -------------------------------------------------------------------------

	test('1. Create a project for settings tests', async ({ page }) => {
		await page.goto('/projects/new');

		await page.fill('#name', projectName);
		await page.fill('#description', 'Project for settings E2E tests');
		await page.click('button[type="submit"]');

		await page.waitForURL(/\/projects\/\d+$/, { timeout: 15000 });
		projectUrl = page.url().replace(/\/$/, '');

		// Extract numeric project ID from the URL path
		const match = projectUrl.match(/\/projects\/(\d+)/);
		expect(match).not.toBeNull();
		projectId = match![1];

		await expect(page.locator(`text=${projectName}`).first()).toBeVisible();
	});

	// -------------------------------------------------------------------------
	// 2. Navigate to project settings
	// -------------------------------------------------------------------------

	test('2. Should navigate to project settings page', async ({ page }) => {
		await page.goto(settingsUrl());
		await page.waitForLoadState('networkidle');

		await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/settings`));

		// General settings card should be visible
		await expect(page.locator('input#name')).toBeVisible();
	});

	// -------------------------------------------------------------------------
	// 3. Update project name
	// -------------------------------------------------------------------------

	test('3. Should update project name', async ({ page }) => {
		await page.goto(settingsUrl());
		await page.waitForLoadState('networkidle');

		// Clear the name field and type the new name
		const nameInput = page.locator('input#name');
		await expect(nameInput).toBeVisible();
		await nameInput.fill('');
		await nameInput.fill(updatedName);

		// Submit the form
		await page.locator('button[type="submit"]').first().click();

		await expect(page.getByRole('status')).toContainText('저장되었습니다');

		// Reload and verify the new name persisted
		await page.goto(settingsUrl());
		await page.waitForLoadState('networkidle');
		await expect(page.locator('input#name')).toHaveValue(updatedName);
	});

	// -------------------------------------------------------------------------
	// 4. Settings sub-navigation is visible
	// -------------------------------------------------------------------------

	test('4. Should display settings sub-navigation links', async ({ page }) => {
		await page.goto(settingsUrl());
		await page.waitForLoadState('networkidle');

		// The settings layout renders a side-nav with General, Members, Tags
		await expect(page.locator(`a[href="/projects/${projectId}/settings"]`).first()).toBeVisible();
		await expect(
			page.locator(`a[href="/projects/${projectId}/settings/members"]`).first()
		).toBeVisible();
		await expect(
			page.locator(`a[href="/projects/${projectId}/settings/tags"]`).first()
		).toBeVisible();
	});

	// -------------------------------------------------------------------------
	// 5. Navigate to members settings
	// -------------------------------------------------------------------------

	test('5. Should navigate to project members page', async ({ page }) => {
		await page.goto(settingsUrl('members'));
		await page.waitForLoadState('networkidle');

		await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/settings/members`));

		await expect(page.locator('table')).toBeVisible();
		await expect(page.locator('th').first()).toBeVisible();
	});

	// -------------------------------------------------------------------------
	// 6. Current user appears in the members list
	// -------------------------------------------------------------------------

	test('6. Should see the project creator as a member', async ({ page }) => {
		await page.goto(settingsUrl('members'));
		await page.waitForLoadState('networkidle');

		// The logged-in user (global-setup created "E2E Test User") should be a member
		// with the PROJECT_ADMIN role since they created the project.
		const memberRows = page.locator('table tbody tr');
		await expect(memberRows.first()).toBeVisible({ timeout: 10000 });

		await expect(memberRows.first().getByRole('combobox')).toHaveValue('PROJECT_ADMIN');
	});

	// -------------------------------------------------------------------------
	// 7. Add Member dialog can be opened
	// -------------------------------------------------------------------------

	test('7. Should be able to open the Add Member dialog', async ({ page }) => {
		await page.goto(settingsUrl('members'));
		await page.waitForLoadState('networkidle');

		// Click the "Add Member" button (renders a Dialog.Trigger)
		const addMemberBtn = page
			.locator('button', { hasText: /add member|add|멤버 추가|추가/i })
			.first();
		await expect(addMemberBtn).toBeVisible();
		await addMemberBtn.click();

		// Dialog should open — look for the search input inside it
		const dialogSearch = page.locator('#member-search');
		await expect(dialogSearch).toBeVisible({ timeout: 5000 });
		await expect(page.locator('[data-slot=dialog-overlay][data-state=open]')).toHaveCount(1);

		// Close dialog by pressing Escape
		await page.keyboard.press('Escape');
	});

	// -------------------------------------------------------------------------
	// 8. Danger zone (deactivate) section is visible
	// -------------------------------------------------------------------------

	test('8. Should display danger zone section with deactivate button', async ({ page }) => {
		await page.goto(settingsUrl());
		await page.waitForLoadState('networkidle');

		// The danger zone card should appear for active projects
		await expect(page.locator('button', { hasText: /deactivate|비활성/i }).first()).toBeVisible();
	});

	// -------------------------------------------------------------------------
	// 9. Tags settings page loads
	// -------------------------------------------------------------------------

	test('9. Should navigate to tags settings page', async ({ page }) => {
		await page.goto(settingsUrl('tags'));
		await page.waitForLoadState('networkidle');

		await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/settings/tags`));
		// Tags page should render without an error
		await expect(page.locator('body')).toBeVisible();
	});

	test('server validation rejects an empty project name with JavaScript off', async ({
		browser,
		page,
		baseURL
	}) => {
		const client = await browser.newContext({
			baseURL,
			javaScriptEnabled: false,
			storageState: await page.context().storageState()
		});
		try {
			const native = await client.newPage();
			await native.goto(settingsUrl());
			await native.locator('#name').fill('');
			await native.locator('#description').fill('Keep this draft after server validation.');
			await native.getByRole('button', { name: '변경사항 저장' }).click();
			await expect(native.locator('[data-slot=form-error-summary]').getByRole('link')).toHaveText(
				'프로젝트 이름을 입력하세요.'
			);
			await expect(native.locator('#description')).toHaveValue(
				'Keep this draft after server validation.'
			);
			await native.goto(settingsUrl());
			await expect(native.locator('#name')).toHaveValue(updatedName);
			await expect(native.locator('#description')).toHaveValue('Project for settings E2E tests');
		} finally {
			await client.close();
		}
	});

	test('general settings preserve the draft through validation and auxiliary actions', async ({
		page
	}) => {
		await page.setViewportSize({ width: 375, height: 850 });
		await page.goto(settingsUrl());
		await page.waitForLoadState('networkidle');
		const input = page.locator('#name');
		const description = page.locator('#description');
		const save = page.getByRole('button', { name: '변경사항 저장' });
		const summary = page.locator('[data-slot=form-error-summary]');
		await input.fill('');
		await save.press('Enter');
		await expect(summary).toBeFocused();
		await summary.getByRole('link').press('Enter');
		await expect(input).toBeFocused();
		await input.fill(updatedName);
		await description.fill('Preserve these pending project changes.');
		const signoff = page.getByRole('switch', { name: /사인오프 필수/ });
		const signoffRequest = settingsUrl() + '?/toggleSignoff';
		const error = {
			status: 503,
			json: { type: 'error', status: 503, error: { message: 'Unavailable' } }
		};
		await expect(signoff).toHaveAttribute('aria-checked', 'false');
		await page.route(signoffRequest, (route) => route.fulfill(error));
		await signoff.press('Enter');
		await expect(
			page.getByRole('region', { name: /사인오프 필수/ }).getByRole('alert')
		).toBeVisible();
		await expect(signoff).toHaveAttribute('aria-checked', 'false');
		await page.unroute(signoffRequest);
		await signoff.press('Enter');
		await expect(signoff).toHaveAttribute('aria-checked', 'true');
		await expect(description).toHaveValue('Preserve these pending project changes.');

		const tags = page
			.getByRole('navigation', { name: '설정', exact: true })
			.getByRole('link', { name: '태그' });
		await tags.press('Enter');
		const unsaved = page.getByRole('alertdialog', { name: '미저장 변경사항' });
		await expect(unsaved).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(unsaved).toHaveCount(0);
		await tags.press('Enter');
		await expect(unsaved).toBeVisible();
		await unsaved.getByRole('button', { name: '계속 작업하기' }).press('Enter');
		await expect(description).toHaveValue('Preserve these pending project changes.');

		const updateRequest = settingsUrl() + '?/update';
		await page.route(updateRequest, (route) => route.fulfill(error));
		await save.press('Enter');
		await expect(summary).toBeFocused();
		await expect(summary).toContainText('저장하지 못했습니다');
		await expect(description).toHaveValue('Preserve these pending project changes.');
		await page.unroute(updateRequest);
		await save.press('Enter');
		await expect(page.getByRole('status').filter({ hasText: '저장되었습니다' })).toBeVisible();
		await page.reload();
		await expect(description).toHaveValue('Preserve these pending project changes.');
		await expect(signoff).toHaveAttribute('aria-checked', 'true');
	});

	test('deactivation names the project and can be retried from its confirmation', async ({
		page,
		request
	}) => {
		const response = await request.post('/api/projects', {
			data: { name: 'Deactivation ' + 'longidentifier'.repeat(5) }
		});
		expect(response.ok()).toBe(true);
		const fixture = (await response.json()).data;
		const path = `/projects/${fixture.id}/settings`;
		try {
			await page.setViewportSize({ width: 375, height: 850 });
			await page.goto(path);
			await page.waitForLoadState('networkidle');
			const trigger = page
				.getByRole('main')
				.getByRole('button', { name: '프로젝트 비활성화', exact: true });
			await trigger.press('Enter');
			const dialog = page.getByRole('alertdialog', { name: '프로젝트 비활성화' });
			await expect(dialog).toContainText(fixture.name);
			await expect(page.locator('[data-slot=alert-dialog-overlay][data-state=open]')).toHaveCount(
				1
			);
			await dialog.getByRole('button', { name: '취소' }).press('Enter');
			await expect(trigger).toBeFocused();
			await trigger.press('Enter');
			const action = '**' + path + '?/deactivate';
			await page.route(action, (route) =>
				route.fulfill({
					status: 503,
					json: { type: 'error', status: 503, error: { message: 'Unavailable' } }
				})
			);
			const confirm = dialog.getByRole('button', { name: '프로젝트 비활성화', exact: true });
			await confirm.press('Enter');
			await expect(dialog.getByRole('alert')).toBeFocused();
			await expect(dialog).toContainText(fixture.name);
			await page.unroute(action);
			await confirm.press('Enter');
			await expect(page).toHaveURL(/\/projects$/);
		} finally {
			const cleanup = await request.delete(`/api/projects/${fixture.id}`);
			expect([200, 404]).toContain(cleanup.status());
		}
	});

	for (const locale of ['ko', 'en'])
		for (const theme of ['light', 'dark'])
			for (const width of [375, 768, 1440]) {
				test(`${locale}/${theme}/${width}: settings links and form remain readable`, async ({
					page
				}, testInfo) => {
					await page.setViewportSize({ width, height: 850 });
					await page.goto(settingsUrl());
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
					const nav = main.getByRole('navigation', { name: /^(설정|Settings)$/ });
					await expect(nav.getByRole('link')).toHaveCount(9);
					await expect(nav.getByRole('link', { name: /^(일반|General)$/ })).toHaveAttribute(
						'aria-current',
						'page'
					);
					expect(await nav.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
					expect(await main.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
					const audit = await new AxeBuilder({ page })
						.include('main')
						.withTags(['wcag2a', 'wcag2aa'])
						.analyze();
					expect(
						audit.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''))
					).toEqual([]);
					if (locale === 'ko' && width === 375)
						await testInfo.attach('project-settings-general', {
							body: await page.screenshot({ path: `/tmp/testmini-project-settings-${theme}.png` }),
							contentType: 'image/png'
						});
					await nav.getByRole('link', { name: /^(태그|Tags)$/ }).press('Enter');
					await expect(page).toHaveURL(/settings\/tags$/);
				});
			}
});
