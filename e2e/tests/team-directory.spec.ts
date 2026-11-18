import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import type { APIRequestContext } from '@playwright/test';
import { test, expect } from '../fixtures/auth.fixture';

test.describe('Team directory and creation', () => {
	const teamIds: number[] = [];
	const id = randomUUID();
	const longName = 'LongTeamDirectoryName'.repeat(4) + id.slice(0, 8);
	const description = 'QA%_Dispatch ' + id;
	let memberTeam: number;
	let privateTeam: number;

	async function action(
		request: APIRequestContext,
		baseURL: string,
		path: string,
		form: Record<string, string>
	) {
		const response = await request.post(path, {
			form,
			headers: { origin: baseURL, accept: 'application/json', 'x-sveltekit-action': 'true' }
		});
		expect(response.ok()).toBe(true);
		return response.json();
	}

	test.beforeAll(async ({ request, baseURL }) => {
		const team = async (name: string, description: string) => {
			const result = await action(request, baseURL!, '/teams/new', { name, description });
			expect(result.type).toBe('redirect');
			const teamId = Number(result.location.split('/').at(-1));
			expect(teamId).toBeGreaterThan(0);
			teamIds.push(teamId);
			return teamId;
		};
		memberTeam = await team(longName, description);
		privateTeam = await team('Hidden test team ' + id, 'QAXYDispatch ' + id);
	});

	test.afterAll(async ({ request, baseURL }) => {
		for (const teamId of teamIds) {
			expect((await action(request, baseURL!, `/teams/${teamId}/settings?/delete`, {})).type).toBe(
				'redirect'
			);
		}
	});

	test('search handles literal symbols, preserves browser history and restores clear focus', async ({
		page
	}) => {
		await page.setViewportSize({ width: 375, height: 850 });
		await page.goto('/teams');
		await page.waitForLoadState('networkidle');
		const main = page.getByRole('main');
		const search = main.getByRole('searchbox', { name: '팀 이름 또는 설명 검색' });
		await search.fill('QA%_Dispatch ' + id);
		await search.press('Enter');
		await expect(main.getByRole('status').filter({ hasText: '검색된 팀' })).toContainText('1개');
		const link = main.getByRole('link', { name: longName, exact: true });
		await expect(link).toHaveAttribute('href', '/teams/' + memberTeam);
		await expect(main.getByRole('link', { name: 'Hidden test team ' + id })).toHaveCount(0);
		expect(new URL(page.url()).searchParams.get('search')).toBe(description);

		await search.fill('No matching team ' + id);
		await search.press('Enter');
		await expect(main.getByRole('heading', { name: '조건에 맞는 결과가 없습니다' })).toBeVisible();
		await page.goBack();
		await expect(search).toHaveValue(description);
		await expect(link).toBeVisible();
		await page.reload();
		await page.waitForLoadState('networkidle');
		await expect(search).toHaveValue(description);
		const clear = main.getByRole('link', { name: '검색어 지우기' });
		await clear.press('Enter');
		await expect(search).toBeFocused();
		await expect(search).toHaveValue('');
		await expect(page).toHaveURL(/\/teams$/);
		await link.press('Enter');
		await expect(page).toHaveURL(new RegExp('/teams/' + memberTeam + '$'));
	});

	test('team creation preserves the draft through invalid input and server failures', async ({
		page
	}) => {
		await page.goto('/teams/new');
		await page.waitForLoadState('networkidle');
		const name = page.locator('#name');
		const details = page.locator('#description');
		const submit = page.getByRole('button', { name: '팀 생성' });
		const summary = page.locator('[data-slot=form-error-summary]');
		await details.fill('Keep this team description.');
		await submit.press('Enter');
		await expect(summary).toBeFocused();
		await summary.getByRole('link').press('Enter');
		await expect(name).toBeFocused();
		await expect(details).toHaveValue('Keep this team description.');

		await name.fill('Recovered Team ' + id);
		const create = '**/teams/new';
		await page.route(create, (route) =>
			route.fulfill({
				status: 503,
				json: { type: 'error', status: 503, error: { message: 'Unavailable' } }
			})
		);
		await submit.press('Enter');
		await expect(summary).toBeFocused();
		await expect(summary).toContainText('저장하지 못했습니다');
		await expect(name).toHaveValue('Recovered Team ' + id);
		await expect(details).toHaveValue('Keep this team description.');
		await page.unroute(create);
		await submit.press('Enter');
		await page.waitForURL(/\/teams\/\d+$/);
		teamIds.push(Number(new URL(page.url()).pathname.split('/').at(-1)));
	});

	test('team creation still validates and returns the description without JavaScript', async ({
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
			await native.goto('/teams/new');
			await native.locator('#description').fill('Keep the native team draft.');
			await native.getByRole('button', { name: '팀 생성' }).click();
			await expect(native.locator('[data-slot=form-error-summary]').getByRole('link')).toHaveText(
				'팀 이름을 입력하세요.'
			);
			await expect(native.locator('#description')).toHaveValue('Keep the native team draft.');
		} finally {
			await client.close();
		}
	});

	test('a normal account can search only its own teams', async ({ request, browser, baseURL }) => {
		const userEmail = `team-ui-${id}@example.com`;
		const password = randomUUID();
		const created = await request.post('/api/auth/admin/create-user', {
			data: { name: 'Team directory test', email: userEmail, password, role: 'user' },
			headers: { origin: baseURL! }
		});
		expect(created.ok()).toBe(true);
		const userId = (await created.json()).user.id;
		const viewer = await browser.newContext({ baseURL });
		try {
			expect(
				(
					await viewer.request.post('/api/auth/sign-in/email', {
						data: { email: userEmail, password },
						headers: { origin: baseURL! }
					})
				).ok()
			).toBe(true);
			const page = await viewer.newPage();
			await page.goto('/teams');
			await expect(page.getByRole('heading', { name: '아직 팀이 없습니다' })).toBeVisible();
			expect(
				(
					await action(request, baseURL!, `/teams/${memberTeam}/settings/members?/addMember`, {
						userId,
						role: 'MEMBER'
					})
				).type
			).toBe('success');
			await page.goto('/teams?search=' + encodeURIComponent(id));
			const list = page.getByRole('list', { name: '팀' });
			await expect(list.getByRole('link')).toHaveCount(1);
			await expect(list.getByRole('link', { name: longName })).toHaveAttribute(
				'href',
				'/teams/' + memberTeam
			);
			await expect(list.locator(`[href="/teams/${privateTeam}"]`)).toHaveCount(0);
		} finally {
			await viewer.close();
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
				test(`${locale}/${theme}/${width}: team list and creation form are accessible`, async ({
					page
				}) => {
					await page.setViewportSize({ width, height: 850 });
					await page.goto('/teams?search=' + encodeURIComponent(description));
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
					await expect(main.getByRole('link', { name: longName, exact: true })).toBeVisible();
					for (const route of ['list', 'new']) {
						if (route === 'new') {
							await main.getByRole('link', { name: /^(새 팀|New Team)$/i }).press('Enter');
							await expect(
								main.getByRole('heading', { name: /^(새 팀|New Team)$/i })
							).toBeVisible();
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
