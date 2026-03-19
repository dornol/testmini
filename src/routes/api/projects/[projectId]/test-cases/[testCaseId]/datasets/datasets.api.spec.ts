import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testCase: { id: 'id', projectId: 'project_id' },
	testCaseDataSet: {
		id: 'id',
		testCaseId: 'test_case_id',
		name: 'name',
		values: 'values',
		orderIndex: 'order_index'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	asc: vi.fn((a: unknown) => a)
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

const PARAMS = { projectId: '1', testCaseId: '10' };

describe('/api/projects/[projectId]/test-cases/[testCaseId]/datasets', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ params: PARAMS, user: null });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return 404 when test case not found', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(null);
			const event = createMockEvent({ params: PARAMS, user: testUser });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return datasets list', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue({ id: 10, projectId: 1 });
			mockSelectResult(mockDb, [
				{ id: 1, testCaseId: 10, name: 'Happy path', values: { user: 'admin' }, orderIndex: 0 },
				{ id: 2, testCaseId: 10, name: 'Edge case', values: { user: '' }, orderIndex: 1 }
			]);

			const event = createMockEvent({ params: PARAMS, user: testUser });
			const response = await GET(event);
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body).toHaveLength(2);
			expect(body[0].name).toBe('Happy path');
		});
	});

	describe('POST', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { values: { key: 'val' } },
				user: null
			});
			await expect(POST(event)).rejects.toThrow();
		});

		it('should return 404 when test case not found', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(null);
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { values: { key: 'val' } },
				user: testUser
			});
			await expect(POST(event)).rejects.toThrow();
		});

		it('should return 400 when values is missing', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue({ id: 10, projectId: 1 });
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'DS1' },
				user: testUser
			});
			const response = await POST(event);
			expect(response.status).toBe(400);
		});

		it('should create dataset on success', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue({ id: 10, projectId: 1 });

			// select for max order returns empty
			mockSelectResult(mockDb, []);

			const created = { id: 3, testCaseId: 10, name: 'New DS', values: { user: 'test' }, orderIndex: 0 };
			mockInsertReturning(mockDb, [created]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'New DS', values: { user: 'test' } },
				user: testUser
			});
			const response = await POST(event);
			expect(response.status).toBe(201);
			const body = await response.json();
			expect(body.name).toBe('New DS');
		});

		it('should create dataset without name', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue({ id: 10, projectId: 1 });
			mockSelectResult(mockDb, []);

			const created = { id: 4, testCaseId: 10, name: null, values: { a: 'b' }, orderIndex: 0 };
			mockInsertReturning(mockDb, [created]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { values: { a: 'b' } },
				user: testUser
			});
			const response = await POST(event);
			expect(response.status).toBe(201);
		});
	});
});
