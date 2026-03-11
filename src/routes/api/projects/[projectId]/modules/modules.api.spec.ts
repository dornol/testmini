import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockInsertReturning, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	module: {
		id: 'id', projectId: 'project_id', name: 'name', parentModuleId: 'parent_module_id',
		description: 'description', sortOrder: 'sort_order', createdBy: 'created_by', createdAt: 'created_at'
	},
	moduleTestCase: { id: 'id', moduleId: 'module_id', testCaseId: 'test_case_id' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({ as: () => ({ sql: strings, values }) }),
		{ raw: (s: string) => s }
	)
}));

vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' }),
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});

const { GET, POST } = await import('./+server');

describe('/api/projects/[projectId]/modules', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET', () => {
		it('should return modules list with test case counts', async () => {
			mockSelectResult(mockDb, [
				{ id: 1, name: 'Auth', parentModuleId: null, testCaseCount: 5 },
				{ id: 2, name: 'Login', parentModuleId: 1, testCaseCount: 3 }
			]);

			const event = createMockEvent({
				params: { projectId: '1' },
				user: testUser
			});
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data).toHaveLength(2);
		});
	});

	describe('POST', () => {
		it('should create a new module', async () => {
			const created = { id: 1, name: 'Auth', parentModuleId: null };
			mockInsertReturning(mockDb, [created]);

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: 'Auth' },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(201);
			expect(data.name).toBe('Auth');
		});

		it('should create module with parent', async () => {
			const created = { id: 2, name: 'Login', parentModuleId: 1 };
			mockInsertReturning(mockDb, [created]);

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: 'Login', parentModuleId: 1 },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(201);
			expect(data.parentModuleId).toBe(1);
		});

		it('should return 400 for missing name', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: {},
				user: testUser
			});
			const response = await POST(event);
			expect(response.status).toBe(400);
		});

		it('should return 400 for empty name', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: '' },
				user: testUser
			});
			const response = await POST(event);
			expect(response.status).toBe(400);
		});

		it('should return 401 for unauthenticated', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: 'Auth' },
				user: null
			});
			await expect(POST(event)).rejects.toThrow();
		});
	});
});
