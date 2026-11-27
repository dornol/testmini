import { randomUUID } from 'node:crypto';
import { test, expect } from '../fixtures/auth.fixture';

/**
 * Checks docs/ROLES.md against the running app.
 *
 * Every row sends a request that the role check sees first and the handler would reject
 * afterwards: an empty body for creates, a non-existent id for edits and deletes. So a role
 * that is NOT allowed must get exactly 403, and a role that IS allowed must get anything but
 * 401/403 (400 or 404 in practice). Nothing gets created or deleted.
 *
 * The rows mirror the matrix in docs/ROLES.md. If you change a rule, change both.
 */
type Role = 'PROJECT_ADMIN' | 'QA' | 'DEV' | 'VIEWER';
const PA: Role[] = ['PROJECT_ADMIN'];
const PQ: Role[] = ['PROJECT_ADMIN', 'QA'];
const PQD: Role[] = ['PROJECT_ADMIN', 'QA', 'DEV'];
const MISSING = 999999999;

type Row = {
	label: string;
	method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
	path: string;
	allowed: Role[];
	/** A SvelteKit form action (sent as a form instead of JSON). */
	action?: Record<string, string>;
};

const api = (path: string) => `/api/projects/:id/${path}`;
const rows: Row[] = [
	// Test design
	{ label: 'create test case group', method: 'POST', path: api('test-case-groups'), allowed: PQD },
	{
		label: 'delete test case group',
		method: 'DELETE',
		path: api(`test-case-groups/${MISSING}`),
		allowed: PA
	},
	{ label: 'create module', method: 'POST', path: api('modules'), allowed: PQD },
	{ label: 'delete module', method: 'DELETE', path: api(`modules/${MISSING}`), allowed: PA },
	{ label: 'create template', method: 'POST', path: api('templates'), allowed: PQD },
	{ label: 'delete template', method: 'DELETE', path: api(`templates/${MISSING}`), allowed: PA },
	{
		label: 'delete shared dataset (DEV allowed)',
		method: 'DELETE',
		path: api(`shared-datasets/${MISSING}`),
		allowed: PQD
	},
	{ label: 'edit test case', method: 'PATCH', path: api(`test-cases/${MISSING}`), allowed: PQD },
	{ label: 'delete test case', method: 'DELETE', path: api(`test-cases/${MISSING}`), allowed: PA },
	{ label: 'import test cases', method: 'POST', path: api('test-cases/import'), allowed: PQ },
	{ label: 'create suite', method: 'POST', path: api('test-suites'), allowed: PQ },
	{ label: 'edit suite', method: 'PATCH', path: api(`test-suites/${MISSING}`), allowed: PQ },
	{
		label: 'delete suite (QA allowed)',
		method: 'DELETE',
		path: api(`test-suites/${MISSING}`),
		allowed: PQ
	},
	{
		label: 'add suite items',
		method: 'POST',
		path: api(`test-suites/${MISSING}/items`),
		allowed: PQ
	},
	{ label: 'create requirement', method: 'POST', path: api('requirements'), allowed: PQ },
	{
		label: 'delete requirement',
		method: 'DELETE',
		path: api(`requirements/${MISSING}`),
		allowed: PQ
	},
	// Planning and execution
	{ label: 'create plan (DEV allowed)', method: 'POST', path: api('test-plans'), allowed: PQD },
	{
		label: 'edit plan (DEV allowed)',
		method: 'PATCH',
		path: api(`test-plans/${MISSING}`),
		allowed: PQD
	},
	{ label: 'delete plan', method: 'DELETE', path: api(`test-plans/${MISSING}`), allowed: PA },
	{
		label: 'sign off plan',
		method: 'POST',
		path: api(`test-plans/${MISSING}/signoffs`),
		allowed: PQ
	},
	{ label: 'create release', method: 'POST', path: api('releases'), allowed: PQ },
	{ label: 'edit release', method: 'PATCH', path: api(`releases/${MISSING}`), allowed: PQ },
	{ label: 'delete release', method: 'DELETE', path: api(`releases/${MISSING}`), allowed: PA },
	{ label: 'create cycle', method: 'POST', path: api('test-cycles'), allowed: PQ },
	{ label: 'edit cycle', method: 'PUT', path: api(`test-cycles/${MISSING}`), allowed: PQ },
	{ label: 'delete cycle', method: 'DELETE', path: api(`test-cycles/${MISSING}`), allowed: PA },
	{ label: 'edit run', method: 'PATCH', path: api(`test-runs/${MISSING}`), allowed: PQD },
	{ label: 'delete run', method: 'DELETE', path: api(`test-runs/${MISSING}`), allowed: PA },
	{ label: 'create cross-env run', method: 'POST', path: api('test-runs/cross-env'), allowed: PQ },
	{
		label: 'create exploratory session',
		method: 'POST',
		path: api('exploratory-sessions'),
		allowed: PQD
	},
	{
		label: 'delete exploratory session (DEV allowed)',
		method: 'DELETE',
		path: api(`exploratory-sessions/${MISSING}`),
		allowed: PQD
	},
	// Project configuration
	{ label: 'create tag', method: 'POST', path: api('tags'), allowed: PQD },
	{ label: 'create custom field', method: 'POST', path: api('custom-fields'), allowed: PA },
	{ label: 'create webhook', method: 'POST', path: api('webhooks'), allowed: PA },
	{ label: 'create API key', method: 'POST', path: api('api-keys'), allowed: PA },
	{ label: 'set up issue tracker', method: 'POST', path: api('issue-tracker'), allowed: PA },
	{ label: 'create report schedule', method: 'POST', path: api('reports/schedules'), allowed: PA },
	{ label: 'create report share link', method: 'POST', path: api('reports/share'), allowed: PQ },
	// Form actions
	{
		label: 'delete tag (form action, DEV allowed)',
		method: 'POST',
		path: '/projects/:id/settings/tags?/delete',
		allowed: PQD,
		action: { tagId: String(MISSING) }
	},
	{
		label: 'delete priority (form action, DEV allowed)',
		method: 'POST',
		path: '/projects/:id/settings/priorities?/delete',
		allowed: PQD,
		action: { priorityId: String(MISSING) }
	},
	{
		label: 'delete environment (form action, DEV allowed)',
		method: 'POST',
		path: '/projects/:id/settings/environments?/delete',
		allowed: PQD,
		action: { environmentId: String(MISSING) }
	},
	{
		label: 'remove member (form action)',
		method: 'POST',
		path: '/projects/:id/settings/members?/removeMember',
		allowed: PA,
		action: { userId: 'nobody' }
	},
	{
		label: 'delete test case (form action)',
		method: 'POST',
		path: `/projects/:id/test-cases/${MISSING}?/delete`,
		allowed: PA,
		action: {}
	}
];

test.describe.serial('Role matrix', () => {
	const key = randomUUID().slice(0, 8);
	const password = randomUUID();
	const roles: Role[] = ['PROJECT_ADMIN', 'QA', 'DEV', 'VIEWER'];
	const users = new Map<Role, { id: string; email: string }>();
	let projectId: number;

	test.beforeAll(async ({ request, baseURL }) => {
		const project = await request.post('/api/projects', { data: { name: `Roles ${key}` } });
		expect(project.ok()).toBe(true);
		projectId = (await project.json()).data.id;
		for (const role of roles) {
			const email = `role-${role.toLowerCase()}-${key}@example.com`;
			const created = await request.post('/api/auth/admin/create-user', {
				data: { email, password, name: `Role ${role} ${key}`, role: 'user' },
				headers: { origin: baseURL! }
			});
			expect(created.ok()).toBe(true);
			const id = (await created.json()).user.id as string;
			users.set(role, { id, email });
			const member = await request.post(`/projects/${projectId}/settings/members?/addMember`, {
				form: { userId: id, role },
				headers: {
					'x-sveltekit-action': 'true',
					accept: 'application/json',
					origin: baseURL!
				}
			});
			expect((await member.json()).type).toBe('success');
		}
	});

	test.afterAll(async ({ request, baseURL }) => {
		if (projectId) await request.delete(`/api/projects/${projectId}`);
		for (const { id } of users.values())
			await request.post('/api/auth/admin/remove-user', {
				data: { userId: id },
				headers: { origin: baseURL! }
			});
	});

	async function send(
		request: import('@playwright/test').APIRequestContext,
		baseURL: string,
		row: Row
	) {
		const url = row.path.replace(':id', String(projectId));
		const headers: Record<string, string> = { origin: baseURL };
		if (row.action) {
			headers['x-sveltekit-action'] = 'true';
			headers.accept = 'application/json';
			return request.fetch(url, { method: row.method, form: row.action, headers });
		}
		return request.fetch(url, { method: row.method, data: {}, headers });
	}

	for (const role of roles)
		test(`${role}: every row of the matrix behaves as documented`, async ({ browser, baseURL }) => {
			const context = await browser.newContext({ baseURL });
			try {
				const login = await context.request.post('/api/auth/sign-in/email', {
					data: { email: users.get(role)!.email, password },
					headers: { origin: baseURL! }
				});
				expect(login.ok()).toBe(true);
				const mismatches: string[] = [];
				for (const row of rows) {
					const status = (await send(context.request, baseURL!, row)).status();
					const allowed = row.allowed.includes(role);
					const ok = allowed ? status !== 403 && status !== 401 : status === 403;
					if (!ok)
						mismatches.push(
							`${row.label}: ${row.method} ${row.path} -> ${status}, expected ${allowed ? 'not 403' : '403'}`
						);
				}
				expect(mismatches).toEqual([]);
			} finally {
				await context.close();
			}
		});

	test('a global admin passes every row', async ({ request, baseURL }) => {
		const mismatches: string[] = [];
		for (const row of rows) {
			const status = (await send(request, baseURL!, row)).status();
			if (status === 403 || status === 401) mismatches.push(`${row.label} -> ${status}`);
		}
		expect(mismatches).toEqual([]);
	});

	test('a user who is not a member gets 403 everywhere', async ({ browser, baseURL, request }) => {
		const email = `role-outsider-${key}@example.com`;
		const created = await request.post('/api/auth/admin/create-user', {
			data: { email, password, name: `Outsider ${key}`, role: 'user' },
			headers: { origin: baseURL! }
		});
		expect(created.ok()).toBe(true);
		const outsiderId = (await created.json()).user.id as string;
		const context = await browser.newContext({ baseURL });
		try {
			await context.request.post('/api/auth/sign-in/email', {
				data: { email, password },
				headers: { origin: baseURL! }
			});
			const mismatches: string[] = [];
			for (const row of rows) {
				const status = (await send(context.request, baseURL!, row)).status();
				if (status !== 403) mismatches.push(`${row.label} -> ${status}`);
			}
			expect(mismatches).toEqual([]);
		} finally {
			await context.close();
			await request.post('/api/auth/admin/remove-user', {
				data: { userId: outsiderId },
				headers: { origin: baseURL! }
			});
		}
	});
});
