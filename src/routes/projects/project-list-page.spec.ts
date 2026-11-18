import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { adminUser, testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	project: {
		id: 'id',
		name: 'name',
		description: 'description',
		active: 'active',
		createdAt: 'created_at'
	},
	projectMember: {
		projectId: 'project_id',
		userId: 'user_id'
	}
}));
vi.mock('drizzle-orm', () => {
	const sqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => ({
		as: vi.fn().mockReturnValue({ strings, values })
	});
	sqlTag.raw = vi.fn((s: string) => s);
	return {
		and: vi.fn((...args: unknown[]) => args),
		eq: vi.fn((a: unknown, b: unknown) => [a, b]),
		ilike: vi.fn((a: unknown, b: unknown) => ['ilike', a, b]),
		count: vi.fn(() => 'count'),
		desc: vi.fn((column: unknown) => ['desc', column]),
		inArray: vi.fn((a: unknown, b: unknown) => ['inArray', a, b]),
		sql: sqlTag
	};
});
vi.mock('$lib/server/auth-utils', () => ({
	isGlobalAdmin: vi.fn((user: { role?: string }) => user.role === 'admin')
}));

const { load } = await import('./+page.server');

function createLoadEvent(searchParams: Record<string, string> = {}, user = adminUser) {
	const url = new URL('http://localhost:5173/projects');
	for (const [key, value] of Object.entries(searchParams)) {
		url.searchParams.set(key, value);
	}
	return {
		url,
		locals: {
			user,
			session: { id: 'session-1' },
			requestId: 'test-req'
		}
	} as never;
}

function setupSelectMock(projects: unknown[] = [], total = 0) {
	let selectCall = 0;
	mockDb.select.mockImplementation(() => {
		selectCall++;
		const chain: Record<string, unknown> = {};
		for (const method of ['from', 'where', 'orderBy', 'limit', 'offset']) {
			chain[method] = vi.fn().mockReturnValue(chain);
		}
		const data = selectCall === 1 ? projects : [{ total }];
		chain.then = (resolve: (value: unknown) => void) => Promise.resolve(data).then(resolve);
		return chain;
	});
}

describe('projects list page server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should return projects with default pagination', async () => {
		setupSelectMock([{ id: 1, name: 'Project' }], 1);

		const result = (await load(createLoadEvent())) as Record<string, any>;

		expect(result.projects).toHaveLength(1);
		expect(result.meta).toMatchObject({ page: 1, limit: 12, total: 1, totalPages: 1 });
		const { desc } = await import('drizzle-orm');
		expect(desc).toHaveBeenCalledWith('created_at');
	});

	it('should clamp limit to 50', async () => {
		setupSelectMock([], 100);

		const result = (await load(createLoadEvent({ limit: '500' }))) as Record<string, any>;

		expect(result.meta.limit).toBe(50);
		expect(result.meta.totalPages).toBe(2);
	});

	it.each(['Infinity', '1.5', '9007199254740992'])(
		'should fall back to page 1 for unsafe page value %s',
		async (page) => {
			setupSelectMock([], 0);

			const result = (await load(createLoadEvent({ page }))) as Record<string, any>;

			expect(result.meta.page).toBe(1);
		}
	);

	it.each(['Infinity', '1.5', '9007199254740992'])(
		'should fall back to default limit for unsafe limit value %s',
		async (limit) => {
			setupSelectMock([], 0);

			const result = (await load(createLoadEvent({ limit }))) as Record<string, any>;

			expect(result.meta.limit).toBe(12);
		}
	);

	it('returns a valid last page without dropping the search or status', async () => {
		setupSelectMock([], 3);

		await expect(
			load(createLoadEvent({ page: '8', search: 'Alpha', active: 'false', limit: '2' }))
		).rejects.toMatchObject({
			status: 302,
			location: '/projects?page=2&search=Alpha&active=false&limit=2'
		});
	});

	it('returns to the first page when an old filter has no results', async () => {
		setupSelectMock([], 0);

		await expect(load(createLoadEvent({ page: '8', search: 'missing' }))).rejects.toMatchObject({
			status: 302,
			location: '/projects?search=missing'
		});
	});

	it('should scope non-admin users to their member projects', async () => {
		setupSelectMock([], 0);

		await load(createLoadEvent({}, testUser));

		expect(mockDb.select).toHaveBeenCalled();
	});
});
