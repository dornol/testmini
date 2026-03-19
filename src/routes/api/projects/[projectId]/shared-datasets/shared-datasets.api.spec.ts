import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	sharedDataSet: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		parameters: 'parameters',
		rows: 'rows',
		createdBy: 'created_by',
		createdAt: 'created_at'
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

const PARAMS = { projectId: '1' };

describe('/api/projects/[projectId]/shared-datasets', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ params: PARAMS, user: null });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return empty array when no datasets exist', async () => {
			mockSelectResult(mockDb, []);
			const event = createMockEvent({ params: PARAMS, user: testUser });
			const response = await GET(event);
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body).toEqual([]);
		});

		it('should return datasets list', async () => {
			mockSelectResult(mockDb, [
				{ id: 1, name: 'Login Data', parameters: ['user', 'pass'], rows: [] },
				{ id: 2, name: 'Search Data', parameters: ['query'], rows: [{ query: 'test' }] }
			]);
			const event = createMockEvent({ params: PARAMS, user: testUser });
			const response = await GET(event);
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body).toHaveLength(2);
			expect(body[0].name).toBe('Login Data');
		});
	});

	describe('POST', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'DS', parameters: ['a'], rows: [] },
				user: null
			});
			await expect(POST(event)).rejects.toThrow();
		});

		it('should return 400 when name is missing', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: '', parameters: ['a'], rows: [] },
				user: testUser
			});
			const response = await POST(event);
			expect(response.status).toBe(400);
		});

		it('should return 400 when parameters is empty', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'DS', parameters: [], rows: [] },
				user: testUser
			});
			const response = await POST(event);
			expect(response.status).toBe(400);
		});

		it('should return 400 when parameters is missing', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'DS' },
				user: testUser
			});
			const response = await POST(event);
			expect(response.status).toBe(400);
		});

		it('should create dataset on success', async () => {
			const created = { id: 1, name: 'Login Data', parameters: ['user', 'pass'], rows: [] };
			mockInsertReturning(mockDb, [created]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'Login Data', parameters: ['user', 'pass'], rows: [] },
				user: testUser
			});
			const response = await POST(event);
			expect(response.status).toBe(201);
			const body = await response.json();
			expect(body.name).toBe('Login Data');
		});
	});
});
