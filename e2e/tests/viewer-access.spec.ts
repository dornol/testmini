import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures/auth.fixture';

/**
 * VIEWER access to the workflow list pages.
 *
 * The pages hide their create actions behind a role check. This spec checks that a VIEWER
 * still reads the data, sees no create action (while the admin does, so the check is not
 * vacuous), has no overflow or serious a11y problem, and that the API refuses writes.
 */
test.describe.serial('VIEWER access to workflow pages', () => {
	const key = randomUUID();
	const email = `viewer-${key}@example.com`;
	const password = randomUUID();
	let userId: string;
	let projectId: number;
	const seeded = {
		releases: `Release ${key.slice(0, 8)}`,
		'test-cycles': `Cycle ${key.slice(0, 8)}`,
		'test-plans': `Plan ${key.slice(0, 8)}`,
		'test-suites': `Suite ${key.slice(0, 8)}`,
		exploratory: `Session ${key.slice(0, 8)}`
	};
	const pages = [
		{ path: 'releases', create: '새 릴리스', seed: seeded.releases },
		{ path: 'test-cycles', create: '새 사이클', seed: seeded['test-cycles'] },
		{ path: 'test-plans', create: '새 계획', seed: seeded['test-plans'] },
		{ path: 'test-suites', create: '새 스위트', seed: seeded['test-suites'] },
		{ path: 'exploratory', create: '새 세션', seed: seeded.exploratory },
		{ path: 'test-runs', create: '새 테스트 런', seed: null }
	];
	const detailIds = new Map<string, number>();
	const headers = (baseURL: string) => ({ origin: baseURL });

	test.beforeAll(async ({ request, baseURL }) => {
		const project = await request.post('/api/projects', { data: { name: `Viewer ${key}` } });
		expect(project.ok()).toBe(true);
		projectId = (await project.json()).data.id;

		const user = await request.post('/api/auth/admin/create-user', {
			data: { email, password, name: 'Viewer User', role: 'user' },
			headers: headers(baseURL!)
		});
		expect(user.ok()).toBe(true);
		userId = (await user.json()).user.id;

		const member = await request.post(`/projects/${projectId}/settings/members?/addMember`, {
			form: { userId, role: 'VIEWER' },
			headers: { 'x-sveltekit-action': 'true', accept: 'application/json', ...headers(baseURL!) }
		});
		expect(member.ok()).toBe(true);

		const base = `/api/projects/${projectId}`;
		const create = async (endpoint: string, data: object) => {
			const response = await request.post(`${base}/${endpoint}`, {
				data,
				headers: headers(baseURL!)
			});
			expect(response.ok(), `${endpoint}: ${response.status()}`).toBe(true);
			const body = await response.json();
			return (body.data ?? body).id as number;
		};
		const created = await request.post(`/projects/${projectId}/test-cases/new`, {
			form: { title: `Case ${key.slice(0, 8)}`, priority: 'MEDIUM' },
			headers: { 'x-sveltekit-action': 'true', accept: 'application/json', ...headers(baseURL!) }
		});
		expect(created.ok()).toBe(true);
		const { location } = (await created.json()) as { location: string };
		const testCaseId = Number(location.match(/test-cases\/(\d+)/)?.[1]);
		expect(testCaseId, `test case location: ${location}`).toBeGreaterThan(0);
		detailIds.set('releases', await create('releases', { name: seeded.releases }));
		await create('test-cycles', { name: seeded['test-cycles'], cycleNumber: 1 });
		detailIds.set('test-plans', await create('test-plans', { name: seeded['test-plans'] }));
		detailIds.set('test-suites', await create('test-suites', { name: seeded['test-suites'] }));
		detailIds.set(
			'exploratory',
			await create('exploratory-sessions', {
				title: seeded.exploratory,
				charter: 'Explore the viewer flow'
			})
		);
		const run = await request.post(`/projects/${projectId}/test-runs/new`, {
			form: {
				name: `Run ${key.slice(0, 8)}`,
				environment: 'staging',
				testCaseIds: String(testCaseId)
			},
			headers: { 'x-sveltekit-action': 'true', accept: 'application/json', ...headers(baseURL!) }
		});
		expect(run.ok()).toBe(true);
		const runLocation = ((await run.json()) as { location: string }).location;
		const runId = Number(runLocation.match(/test-runs\/(\d+)/)?.[1]);
		expect(runId, `run location: ${runLocation}`).toBeGreaterThan(0);
		detailIds.set('test-runs', runId);
		detailIds.set('test-cases', testCaseId);
	});

	test.afterAll(async ({ request, baseURL }) => {
		if (projectId) expect((await request.delete(`/api/projects/${projectId}`)).ok()).toBe(true);
		if (userId)
			expect(
				(
					await request.post('/api/auth/admin/remove-user', {
						data: { userId },
						headers: headers(baseURL!)
					})
				).ok()
			).toBe(true);
	});

	for (const { path, create, seed } of pages) {
		test(`${path}: the admin gets the create action`, async ({ page }) => {
			await page.goto(`/projects/${projectId}/${path}`);
			await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
			await expect(page.getByRole('main').getByText(create, { exact: true }).first()).toBeVisible();
		});

		test(`${path}: a VIEWER reads the data without create actions`, async ({
			browser,
			baseURL
		}) => {
			for (const width of [375, 1440]) {
				const viewer = await browser.newContext({ baseURL, viewport: { width, height: 850 } });
				try {
					const login = await viewer.request.post('/api/auth/sign-in/email', {
						data: { email, password },
						headers: headers(baseURL!)
					});
					expect(login.ok()).toBe(true);
					const page = await viewer.newPage();
					await page.goto(`/projects/${projectId}/${path}`);
					const main = page.getByRole('main');
					await expect(main.getByRole('heading', { level: 1 })).toBeVisible();
					if (seed)
						await expect(main.getByText(seed).filter({ visible: true }).first()).toBeVisible();
					await expect(main.getByText(create, { exact: true })).toHaveCount(0);
					expect(await main.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
					const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
					expect(
						audit.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
					).toEqual([]);
				} finally {
					await viewer.close();
				}
			}
		});
	}

	const mutation = /수정|편집|삭제|추가|연결|완료|시작|저장|서명|승인|제거|복제|가져오기/;
	const names = async (page: import('@playwright/test').Page) =>
		(
			await page
				.getByRole('main')
				.getByRole('button')
				.evaluateAll((els) =>
					els
						.filter((el) => (el as HTMLElement).offsetParent !== null)
						.map((el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim())
				)
		).filter(Boolean);

	for (const path of [
		'releases',
		'test-plans',
		'test-suites',
		'exploratory',
		'test-runs',
		'test-cases'
	]) {
		test(`${path}/[id]: a VIEWER sees the detail without mutation controls`, async ({
			page,
			browser,
			baseURL
		}) => {
			const url = `/projects/${projectId}/${path}/${detailIds.get(path)}`;
			await page.goto(url);
			await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
			const adminNames = await names(page);

			const viewer = await browser.newContext({ baseURL, viewport: { width: 375, height: 850 } });
			try {
				const login = await viewer.request.post('/api/auth/sign-in/email', {
					data: { email, password },
					headers: headers(baseURL!)
				});
				expect(login.ok()).toBe(true);
				const vp = await viewer.newPage();
				await vp.goto(url);
				const main = vp.getByRole('main');
				await expect(main.getByRole('heading', { level: 1 })).toBeVisible();
				const viewerNames = await names(vp);
				// The admin has controls the VIEWER lacks, so the check below is not vacuous.
				expect(adminNames.filter((n) => mutation.test(n)).length).toBeGreaterThan(0);
				expect(viewerNames.filter((n) => mutation.test(n))).toEqual([]);
				expect(await main.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
				const audit = await new AxeBuilder({ page: vp }).withTags(['wcag2a', 'wcag2aa']).analyze();
				expect(
					audit.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
				).toEqual([]);
			} finally {
				await viewer.close();
			}
		});
	}

	test('the API refuses writes from a VIEWER', async ({ browser, baseURL }) => {
		const viewer = await browser.newContext({ baseURL });
		try {
			const login = await viewer.request.post('/api/auth/sign-in/email', {
				data: { email, password },
				headers: headers(baseURL!)
			});
			expect(login.ok()).toBe(true);
			const base = `/api/projects/${projectId}`;
			for (const [endpoint, data] of [
				['releases', { name: 'Denied release' }],
				['test-cycles', { name: 'Denied cycle' }],
				['test-plans', { name: 'Denied plan' }],
				['test-suites', { name: 'Denied suite' }]
			] as const) {
				const response = await viewer.request.post(`${base}/${endpoint}`, {
					data,
					headers: headers(baseURL!)
				});
				expect(response.status(), endpoint).toBe(403);
			}
		} finally {
			await viewer.close();
		}
	});
});
