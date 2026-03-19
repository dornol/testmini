import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { adminUser, testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: vi.fn((c: unknown) => c) }));
vi.mock('$lib/server/db/schema', () => ({
	project: {
		id: 'id',
		name: 'name',
		active: 'active',
		createdAt: 'created_at'
	},
	projectMember: {
		projectId: 'project_id'
	}
}));
vi.mock('drizzle-orm', () => {
	const sqlTag = (...args: unknown[]) => {
		const result = ['sql', ...args];
		(result as Record<string, unknown>).as = vi.fn().mockReturnValue(result);
		return result;
	};
	sqlTag.raw = vi.fn((s: string) => s);
	return {
		eq: vi.fn((a: unknown, b: unknown) => [a, b]),
		ilike: vi.fn((a: unknown, b: unknown) => ['ilike', a, b]),
		count: vi.fn(() => 'count'),
		desc: vi.fn((a: unknown) => ['desc', a]),
		sql: sqlTag
	};
});

const { actions, load } = await import('./+page.server');

function createFormData(entries: Record<string, string>): FormData {
	const fd = new FormData();
	for (const [k, v] of Object.entries(entries)) {
		fd.set(k, v);
	}
	return fd;
}

function createActionEvent(
	user: NonNullable<App.Locals['user']> | null,
	formEntries: Record<string, string>
) {
	const formData = createFormData(formEntries);
	return {
		request: {
			formData: () => Promise.resolve(formData)
		},
		locals: {
			user: user ?? undefined,
			session: user ? { id: 'session-1' } : undefined,
			requestId: 'test-req'
		},
		url: new URL('http://localhost:5173/admin/projects')
	} as never;
}

describe('admin/projects +page.server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('load', () => {
		it('should return projects with default pagination', async () => {
			const url = new URL('http://localhost:5173/admin/projects');
			mockSelectResult(mockDb, [{ count: 3 }]);

			const result = (await load({ url } as never)) as Record<string, unknown>;
			expect(result.projects).toBeDefined();
			expect(result.search).toBe('');
			expect(result.showInactive).toBe(false);
			expect(result.pagination).toMatchObject({
				page: 1,
				limit: 20,
				total: 3,
				totalPages: 1
			});
		});

		it('should apply search filter', async () => {
			const url = new URL('http://localhost:5173/admin/projects?search=alpha');
			mockSelectResult(mockDb, [{ count: 1 }]);

			const result = (await load({ url } as never)) as Record<string, unknown>;
			expect(result.search).toBe('alpha');
			expect(mockDb.select).toHaveBeenCalled();
		});

		it('should show inactive when param is set', async () => {
			const url = new URL('http://localhost:5173/admin/projects?inactive=true');
			mockSelectResult(mockDb, [{ count: 5 }]);

			const result = (await load({ url } as never)) as Record<string, unknown>;
			expect(result.showInactive).toBe(true);
		});

		it('should handle page parameter', async () => {
			const url = new URL('http://localhost:5173/admin/projects?page=2');
			mockSelectResult(mockDb, [{ count: 40 }]);

			const result = (await load({ url } as never)) as Record<string, unknown>;
			expect((result.pagination as Record<string, unknown>).page).toBe(2);
			expect((result.pagination as Record<string, unknown>).totalPages).toBe(2);
		});
	});

	describe('toggleActive', () => {
		it('should return 403 for non-admin users', async () => {
			const event = createActionEvent(testUser, { projectId: '1', active: 'false' });
			const result = await actions.toggleActive(event);
			expect(result).toMatchObject({ status: 403, data: { error: 'Admin access required' } });
		});

		it('should return 401 when not authenticated', async () => {
			const event = createActionEvent(null, { projectId: '1', active: 'false' });
			await expect(actions.toggleActive(event)).rejects.toThrow();
		});

		it('should return 400 for invalid projectId', async () => {
			const event = createActionEvent(adminUser, { projectId: 'abc', active: 'true' });
			const result = await actions.toggleActive(event);
			expect(result).toMatchObject({ status: 400, data: { error: 'Invalid project ID' } });
		});

		it('should toggle active status on success', async () => {
			const event = createActionEvent(adminUser, { projectId: '1', active: 'true' });
			const result = await actions.toggleActive(event);
			expect(result).toMatchObject({ success: true });
			expect(mockDb.update).toHaveBeenCalled();
		});
	});
});
