import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testSuite: {
		id: 'id',
		name: 'name',
		description: 'description',
		projectId: 'project_id',
		createdBy: 'created_by',
		createdAt: 'created_at'
	},
	testSuiteItem: { suiteId: 'suite_id', testCaseId: 'test_case_id' },
	user: { id: 'id', name: 'name' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({
			as: () => ({ sql: strings, values })
		}),
		{ raw: (s: string) => s }
	),
	and: vi.fn((...args: unknown[]) => args)
}));

vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' }),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});

const { GET, POST } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1' };

const sampleSuite = {
	id: 5,
	name: 'Smoke Tests',
	description: 'Basic smoke test suite',
	createdBy: 'Test User',
	createdAt: new Date('2025-01-01'),
	itemCount: 3
};

describe('/api/projects/[projectId]/test-suites', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectAccess).mockResolvedValue({ role: 'QA' });
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'QA' });
	});

	describe('GET', () => {
		it('should return test suites list', async () => {
			mockSelectResult(mockDb, [sampleSuite]);

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser
			});
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(Array.isArray(data)).toBe(true);
			expect(data).toHaveLength(1);
			expect(data[0].id).toBe(5);
			expect(data[0].name).toBe('Smoke Tests');
		});

		it('should return empty array when no suites exist', async () => {
			mockSelectResult(mockDb, []);

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser
			});
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data).toEqual([]);
		});

		it('should return 401 when unauthenticated', async () => {
			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: null
			});
			await expect(GET(event)).rejects.toThrow();
		});
	});

	describe('POST', () => {
		it('should create test suite for QA', async () => {
			const created = { id: 10, projectId: 1, name: 'New Suite', description: null, createdBy: 'user-1', createdAt: new Date() };
			// POST uses db.transaction; mock it to return the created suite
			mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txInsertChain = {
					values: vi.fn().mockReturnThis(),
					returning: vi.fn().mockReturnThis(),
					then: (r: (v: unknown) => void) => Promise.resolve([created]).then(r)
				};
				const tx = {
					insert: vi.fn().mockReturnValue(txInsertChain),
					update: vi.fn(),
					delete: vi.fn(),
					select: vi.fn()
				};
				return fn(tx);
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'New Suite', testCaseIds: [] },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(201);
			expect(data.id).toBe(10);
		});

		it('should create test suite for ADMIN', async () => {
			const created = { id: 11, projectId: 1, name: 'Admin Suite', description: 'desc', createdBy: 'admin-1', createdAt: new Date() };
			vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
			mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txInsertChain = {
					values: vi.fn().mockReturnThis(),
					returning: vi.fn().mockReturnThis(),
					then: (r: (v: unknown) => void) => Promise.resolve([created]).then(r)
				};
				const tx = {
					insert: vi.fn().mockReturnValue(txInsertChain),
					update: vi.fn(),
					delete: vi.fn(),
					select: vi.fn()
				};
				return fn(tx);
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'Admin Suite', description: 'desc', testCaseIds: [] },
				user: adminUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(201);
			expect(data.id).toBe(11);
		});

		it('should return 403 for VIEWER', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'New Suite', testCaseIds: [] },
				user: testUser
			});
			await expect(POST(event)).rejects.toThrow();
		});

		it('should return 401 when unauthenticated', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'New Suite', testCaseIds: [] },
				user: null
			});
			await expect(POST(event)).rejects.toThrow();
		});

		it('should return 400 when name is missing', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { testCaseIds: [] },
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toBe('Invalid input');
		});

		it('should return 400 when name is empty string', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: '', testCaseIds: [] },
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toBe('Invalid input');
		});
	});
});
