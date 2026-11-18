import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures/auth.fixture';

test.describe('Team overview and general settings', () => {
	const suffix = randomUUID();
	const teamName = 'LongTeamSettingsTitle'.repeat(4) + suffix.slice(0, 6);
	const teamIds = new Set<number>();
	let teamId: number;
	const path = () => `/teams/${teamId}`;

	function action(
		request: APIRequestContext,
		baseURL: string,
		path: string,
		form: Record<string, string>
	) {
		return request.post(path, {
			form,
			headers: { origin: baseURL, accept: 'application/json', 'x-sveltekit-action': 'true' }
		});
	}

	async function createTeam(request: APIRequestContext, baseURL: string, name: string) {
		const response = await action(request, baseURL, '/teams/new', {
			name,
			description: 'Test team description'
		});
		expect(response.ok()).toBe(true);
		const result = await response.json();
		expect(result.type).toBe('redirect');
		const id = Number(result.location.split('/').at(-1));
		expect(id).toBeGreaterThan(0);
		teamIds.add(id);
		return id;
	}

	test.beforeAll(async ({ request, baseURL }) => {
		teamId = await createTeam(request, baseURL!, teamName);
	});

	test.afterAll(async ({ request, baseURL }) => {
		for (const id of teamIds) {
			const response = await action(request, baseURL!, '/teams/' + id + '/settings?/delete', {});
			expect((await response.json()).type).toBe('redirect');
		}
	});

	test('failed edits preserve the draft and the settings menu retains keyboard focus', async ({
		page,
		request,
		baseURL
	}) => {
		const endpoint = path() + '/settings';
		await page.setViewportSize({ width: 375, height: 850 });
		await page.goto(endpoint);
		await page.waitForLoadState('networkidle');
		const main = page.getByRole('main');
		const name = main.locator('#name');
		const details = main.locator('#description');
		const save = main.getByRole('button', { name: '변경사항 저장' });
		const summary = main.locator('[data-slot=form-error-summary]');
		await name.fill('');
		await save.press('Enter');
		await expect(summary).toBeFocused();
		await expect(summary.getByRole('link')).toHaveText('팀 이름을 입력하세요.');
		await summary.getByRole('link').press('Enter');
		await expect(name).toBeFocused();
		const blank = await action(request, baseURL!, endpoint + '?/update', {
			name: '',
			description: 'Do not write this'
		});
		expect(await blank.json()).toMatchObject({ type: 'failure', status: 400 });

		await name.fill(teamName);
		await details.fill('Retain the team settings draft.');
		const nav = main.getByRole('navigation', { name: '팀 설정' });
		await expect(nav.getByRole('link', { name: '일반' })).toHaveAttribute('aria-current', 'page');
		await nav.getByRole('link', { name: '멤버' }).press('Enter');
		const guard = page.getByRole('alertdialog', { name: '미저장 변경사항' });
		await guard.getByRole('button', { name: '계속 작업하기' }).press('Enter');
		await expect(details).toHaveValue('Retain the team settings draft.');

		const mutation = '**' + endpoint + '?/update';
		await page.route(mutation, (route) =>
			route.fulfill({
				status: 503,
				json: { type: 'error', status: 503, error: { message: 'Fixture unavailable' } }
			})
		);
		await save.press('Enter');
		await expect(summary).toBeFocused();
		await expect(summary).toContainText('저장하지 못했습니다');
		await expect(details).toHaveValue('Retain the team settings draft.');
		await page.unroute(mutation);
		await save.press('Enter');
		await expect(main.getByRole('status').filter({ hasText: '저장되었습니다' })).toBeVisible();
		await page.reload();
		await expect(details).toHaveValue('Retain the team settings draft.');
	});

	test('delete confirmation identifies the team, preserves the draft on failure and can retry', async ({
		page,
		request,
		baseURL
	}) => {
		const name = 'Temporary team ' + suffix;
		const id = await createTeam(request, baseURL!, name);
		const endpoint = `/teams/${id}/settings`;
		await page.goto(endpoint);
		await page.waitForLoadState('networkidle');
		const main = page.getByRole('main');
		const details = main.locator('#description');
		await details.fill('Pending description when removing the team');
		const trigger = main.getByRole('button', { name: '팀 삭제', exact: true });
		await trigger.press('Enter');
		const dialog = page.getByRole('alertdialog', { name: '팀 삭제' });
		await expect(dialog).toContainText(name);
		await dialog.getByRole('button', { name: '취소' }).press('Enter');
		await expect(trigger).toBeFocused();
		await trigger.press('Enter');
		const deleteAction = '**' + endpoint + '?/delete';
		await page.route(deleteAction, (route) =>
			route.fulfill({
				status: 503,
				json: { type: 'error', status: 503, error: { message: 'Fixture unavailable' } }
			})
		);
		const confirm = dialog.getByRole('button', { name: '삭제', exact: true });
		await confirm.press('Enter');
		await expect(dialog.getByRole('alert')).toBeFocused();
		await expect(details).toHaveValue('Pending description when removing the team');
		await page.unroute(deleteAction);
		await confirm.press('Enter');
		await expect(page).toHaveURL(/\/teams$/);
		teamIds.delete(id);
	});

	test('team member reads settings, team admin can edit, and a nonmember cannot open them', async ({
		browser,
		request,
		baseURL
	}) => {
		const email = `team-general-${suffix}@example.com`;
		const password = randomUUID();
		const response = await request.post('/api/auth/admin/create-user', {
			data: { name: 'Team settings verification', email, password, role: 'user' },
			headers: { origin: baseURL! }
		});
		expect(response.ok()).toBe(true);
		const userId = (await response.json()).user.id;
		const visitor = await browser.newContext({ baseURL });
		try {
			expect(
				(
					await visitor.request.post('/api/auth/sign-in/email', {
						data: { email, password },
						headers: { origin: baseURL! }
					})
				).ok()
			).toBe(true);
			const page = await visitor.newPage();
			expect((await page.goto(path() + '/settings'))?.status()).toBe(403);
			const addMember = await action(request, baseURL!, path() + '/settings/members?/addMember', {
				userId,
				role: 'MEMBER'
			});
			expect((await addMember.json()).type).toBe('success');
			await page.goto(path());
			const main = page.getByRole('main');
			await expect(main.getByRole('heading', { name: teamName })).toBeVisible();
			await expect(main.getByRole('link', { name: '팀 설정' })).toHaveCount(0);
			await page.goto(path() + '/settings');
			await expect(main.getByRole('definition').filter({ hasText: teamName })).toBeVisible();
			await expect(main.getByRole('button', { name: /변경사항 저장|팀 삭제/ })).toHaveCount(0);
			const forbidden = await action(visitor.request, baseURL!, path() + '/settings?/update', {
				name: 'Forbidden'
			});
			expect(await forbidden.json()).toMatchObject({ type: 'failure', status: 403 });

			const adminTeam = await createTeam(request, baseURL!, 'Admin settings ' + suffix);
			const adminPath = '/teams/' + adminTeam + '/settings';
			const addAdmin = await action(request, baseURL!, adminPath + '/members?/addMember', {
				userId,
				role: 'ADMIN'
			});
			expect((await addAdmin.json()).type).toBe('success');
			await page.goto(adminPath);
			await expect(main.getByRole('button', { name: '변경사항 저장' })).toBeVisible();
			await expect(main.getByRole('button', { name: '팀 삭제' })).toHaveCount(0);
			const forbiddenDelete = await action(visitor.request, baseURL!, adminPath + '?/delete', {});
			expect(await forbiddenDelete.json()).toMatchObject({ type: 'failure', status: 403 });
			const partialUpdate = await action(visitor.request, baseURL!, adminPath + '?/update', {
				description: 'Admin saved the description'
			});
			expect((await partialUpdate.json()).type).toBe('success');
			await page.reload();
			await expect(main.locator('#description')).toHaveValue('Admin saved the description');
		} finally {
			await visitor.close();
			expect(
				(
					await request.post('/api/auth/admin/remove-user', {
						data: { userId },
						headers: { origin: baseURL! }
					})
				).ok()
			).toBe(true);
		}
	});

	for (const locale of ['ko', 'en'])
		for (const theme of ['light', 'dark'])
			for (const width of [375, 768, 1440]) {
				test(`${locale}/${theme}/${width}: overview and general settings are accessible`, async ({
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
					await expect(main.getByRole('heading', { name: teamName, exact: true })).toBeVisible();
					for (const route of ['overview', 'settings']) {
						if (route === 'settings') {
							await main.getByRole('link', { name: /^(팀 설정|Team Settings)$/i }).press('Enter');
							await expect(
								main
									.getByRole('navigation', { name: /^(팀 설정|Team Settings)$/i })
									.getByRole('link', { name: /^(일반|General)$/i })
							).toHaveAttribute('aria-current', 'page');
						}
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
