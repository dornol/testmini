import { randomUUID } from 'node:crypto';
import { test, expect } from '../fixtures/auth.fixture';

/**
 * Checks that the screens show each action only to the roles docs/ROLES.md allows.
 *
 * A button shown to a role the server refuses ends in a 403 after the click, and a hidden
 * button for an allowed role takes a feature away. The server side is covered by
 * role-matrix.spec.ts; this spec covers what each role actually sees.
 */
type Role = 'PROJECT_ADMIN' | 'QA' | 'DEV' | 'VIEWER';
const PA: Role[] = ['PROJECT_ADMIN'];
const PQ: Role[] = ['PROJECT_ADMIN', 'QA'];
const PQD: Role[] = ['PROJECT_ADMIN', 'QA', 'DEV'];

type Screen = {
	/** Route segment under /projects/:id. */
	resource: string;
	/** Accessible name of a button on the detail page and who may use it. */
	buttons: Array<[string, Role[]]>;
	/** Label of the create action on the list page (a button or a link) and who may use it. */
	create: [string, Role[]];
};

const screens: Screen[] = [
	{
		resource: 'releases',
		create: ['새 릴리스', PQ],
		buttons: [
			['삭제', PA],
			['계획 연결', PQ],
			['실행 연결', PQ]
		]
	},
	{
		resource: 'test-plans',
		create: ['새 계획', PQD],
		buttons: [
			['삭제', PA],
			['케이스 추가', PQD]
		]
	},
	{
		resource: 'test-suites',
		create: ['새 스위트', PQ],
		buttons: [
			['수정', PQ],
			['삭제', PQ],
			['케이스 추가', PQ]
		]
	},
	{
		resource: 'exploratory',
		create: ['새 세션', PQD],
		buttons: [
			['삭제', PQD],
			['완료', PQD]
		]
	},
	{
		resource: 'test-runs',
		create: ['새 테스트 런', PQD],
		buttons: [
			['수정', PQD],
			['복제', PQD],
			['삭제', PA],
			['런 시작', PQD]
		]
	},
	{
		resource: 'test-cases',
		create: ['새 테스트 케이스', PQD],
		buttons: [
			['수정', PQD],
			['복제', PQD],
			['삭제', PA],
			['검토 요청', PQD]
		]
	}
];

/** Settings pages: path under /projects/:id/settings and the buttons each role may see. */
const settings: Array<{ path: string; buttons: Array<[string, Role[]]> }> = [
	{
		path: '',
		buttons: [
			['변경사항 저장', PA],
			['프로젝트 비활성화', PA]
		]
	},
	{ path: '/tags', buttons: [['태그 추가', PQD]] },
	{
		path: '/priorities',
		buttons: [
			['우선순위 추가', PQD],
			['LOW 수정', PQD],
			['LOW 삭제', PQD]
		]
	},
	{
		path: '/environments',
		buttons: [
			['환경 추가', PQD],
			['DEV 수정', PQD],
			['DEV 삭제', PQD]
		]
	},
	{ path: '/custom-fields', buttons: [['필드 추가', PA]] },
	{ path: '/members', buttons: [['멤버 추가', PA]] },
	{ path: '/webhooks', buttons: [['웹훅 추가', PA]] },
	{ path: '/api-keys', buttons: [['API 키 생성', PA]] },
	{ path: '/issue-tracker', buttons: [['설정 저장', PA]] }
];

test.describe.serial('Role-dependent screens', () => {
	const key = randomUUID().slice(0, 8);
	const password = randomUUID();
	const roles: Role[] = ['PROJECT_ADMIN', 'QA', 'DEV', 'VIEWER'];
	const users = new Map<Role, { id: string; email: string }>();
	const detailIds = new Map<string, number | string>();
	let projectId: number;

	test.beforeAll(async ({ request, baseURL }) => {
		const origin = { origin: baseURL! };
		const form = { 'x-sveltekit-action': 'true', accept: 'application/json', ...origin };
		const project = await request.post('/api/projects', { data: { name: `Screens ${key}` } });
		expect(project.ok()).toBe(true);
		projectId = (await project.json()).data.id;

		for (const role of roles) {
			const email = `screen-${role.toLowerCase()}-${key}@example.com`;
			const created = await request.post('/api/auth/admin/create-user', {
				data: { email, password, name: `Screen ${role} ${key}`, role: 'user' },
				headers: origin
			});
			expect(created.ok()).toBe(true);
			const id = (await created.json()).user.id as string;
			users.set(role, { id, email });
			const member = await request.post(`/projects/${projectId}/settings/members?/addMember`, {
				form: { userId: id, role },
				headers: form
			});
			expect((await member.json()).type).toBe('success');
		}

		const seed = async (endpoint: string, data: object) => {
			const response = await request.post(`/api/projects/${projectId}/${endpoint}`, {
				data,
				headers: origin
			});
			expect(response.ok(), endpoint).toBe(true);
			const body = await response.json();
			return (body.data ?? body).id as number;
		};
		detailIds.set('releases', await seed('releases', { name: `Release ${key}` }));
		detailIds.set('test-plans', await seed('test-plans', { name: `Plan ${key}` }));
		detailIds.set('test-suites', await seed('test-suites', { name: `Suite ${key}` }));
		detailIds.set(
			'exploratory',
			await seed('exploratory-sessions', { title: `Session ${key}`, charter: 'Explore' })
		);
		const testCase = await request.post(`/projects/${projectId}/test-cases/new`, {
			form: { title: `Case ${key}`, priority: 'MEDIUM' },
			headers: form
		});
		const caseId = Number(
			((await testCase.json()) as { location: string }).location.match(/test-cases\/(\d+)/)?.[1]
		);
		expect(caseId).toBeGreaterThan(0);
		detailIds.set('test-cases', caseId);
		const run = await request.post(`/projects/${projectId}/test-runs/new`, {
			form: { name: `Run ${key}`, environment: 'staging', testCaseIds: String(caseId) },
			headers: form
		});
		const runId = Number(
			((await run.json()) as { location: string }).location.match(/test-runs\/(\d+)/)?.[1]
		);
		expect(runId).toBeGreaterThan(0);
		detailIds.set('test-runs', runId);
	});

	test.afterAll(async ({ request, baseURL }) => {
		if (projectId) await request.delete(`/api/projects/${projectId}`);
		for (const { id } of users.values())
			await request.post('/api/auth/admin/remove-user', {
				data: { userId: id },
				headers: { origin: baseURL! }
			});
	});

	const visible = async (
		page: import('@playwright/test').Page,
		name: string,
		role: 'button' | 'link'
	) =>
		(await page
			.getByRole('main')
			.getByRole(role, { name, exact: true })
			.filter({ visible: true })
			.count()) > 0;

	for (const role of roles)
		test(`${role}: list and detail screens offer exactly the allowed actions`, async ({
			browser,
			baseURL
		}) => {
			test.setTimeout(120_000);
			const context = await browser.newContext({
				baseURL,
				viewport: { width: 1440, height: 900 }
			});
			try {
				const login = await context.request.post('/api/auth/sign-in/email', {
					data: { email: users.get(role)!.email, password },
					headers: { origin: baseURL! }
				});
				expect(login.ok()).toBe(true);
				const page = await context.newPage();
				const mismatches: string[] = [];
				for (const { resource, create, buttons } of screens) {
					const [createLabel, createRoles] = create;
					await page.goto(`/projects/${projectId}/${resource}`);
					await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
					const createShown =
						(await visible(page, createLabel, 'button')) ||
						(await visible(page, createLabel, 'link'));
					if (createShown !== createRoles.includes(role))
						mismatches.push(
							`${resource} list: "${createLabel}" is ${createShown ? 'shown' : 'hidden'} for ${role}`
						);

					await page.goto(`/projects/${projectId}/${resource}/${detailIds.get(resource)}`);
					await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
					for (const [name, allowed] of buttons) {
						const shown = await visible(page, name, 'button');
						if (shown !== allowed.includes(role))
							mismatches.push(
								`${resource} detail: "${name}" is ${shown ? 'shown' : 'hidden'} for ${role}`
							);
					}
				}
				expect(mismatches).toEqual([]);
			} finally {
				await context.close();
			}
		});

	for (const role of roles)
		test(`${role}: settings screens offer exactly the allowed actions`, async ({
			browser,
			baseURL
		}) => {
			test.setTimeout(120_000);
			const context = await browser.newContext({
				baseURL,
				viewport: { width: 1440, height: 900 }
			});
			try {
				const login = await context.request.post('/api/auth/sign-in/email', {
					data: { email: users.get(role)!.email, password },
					headers: { origin: baseURL! }
				});
				expect(login.ok()).toBe(true);
				const page = await context.newPage();
				const mismatches: string[] = [];
				for (const { path, buttons } of settings) {
					await page.goto(`/projects/${projectId}/settings${path}`);
					await expect(
						page.getByRole('main'),
						`settings${path} as ${role}: ${page.url()}`
					).toBeVisible();
					for (const [name, allowed] of buttons) {
						const shown = await visible(page, name, 'button');
						if (shown !== allowed.includes(role))
							mismatches.push(
								`settings${path}: "${name}" is ${shown ? 'shown' : 'hidden'} for ${role}`
							);
					}
				}
				expect(mismatches).toEqual([]);
			} finally {
				await context.close();
			}
		});
});
