import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	savedFilter: {
		id: 'id',
		projectId: 'project_id',
		userId: 'user_id',
		name: 'name',
		filterType: 'filter_type',
		filters: 'filters',
		sortOrder: 'sort_order'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	asc: vi.fn((a: unknown) => ['asc', a])
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>(
		'$lib/server/auth-utils'
	);
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' }),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});

const { GET, POST } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1' };

const sampleFilters = [
	{
		id: 1,
		projectId: 1,
		userId: 'user-1',
		name: 'Active Cases',
		filterType: 'test_cases',
		filters: { status: ['ACTIVE'] },
		sortOrder: 1
	},
	{
		id: 2,
		projectId: 1,
		userId: 'user-1',
		name: 'High Priority',
		filterType: 'test_cases',
		filters: { priority: ['HIGH'] },
		sortOrder: 2
	}
];

describe('/api/projects/[projectId]/saved-filters', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectAccess).mockResolvedValue({ role: 'QA' });
		mockDb.query.savedFilter = { findFirst: vi.fn() };
	});

	describe('GET - list saved filters', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'GET', params: PARAMS, user: null });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return list of saved filters', async () => {
			mockSelectResult(mockDb, sampleFilters);

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser
			});
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data).toHaveLength(2);
			expect(data[0].name).toBe('Active Cases');
			expect(data[1].name).toBe('High Priority');
		});

		it('should return empty array when no filters exist', async () => {
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

		it('should pass filter type from query params', async () => {
			mockSelectResult(mockDb, []);

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser,
				searchParams: { type: 'test_runs' }
			});
			const response = await GET(event);

			expect(response.status).toBe(200);
		});

		it('should default filter type to test_cases when not specified', async () => {
			mockSelectResult(mockDb, sampleFilters);

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser
			});
			const response = await GET(event);

			expect(response.status).toBe(200);
		});
	});

	describe('POST - create saved filter', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'Filter', filters: { status: ['ACTIVE'] } },
				user: null
			});
			await expect(POST(event)).rejects.toThrow();
		});

		it('should create a saved filter successfully', async () => {
			mockDb.query.savedFilter.findFirst.mockResolvedValue(null);

			const created = {
				id: 3,
				projectId: 1,
				userId: 'user-1',
				name: 'New Filter',
				filterType: 'test_cases',
				filters: { status: ['ACTIVE'] },
				sortOrder: null
			};
			mockInsertReturning(mockDb, [created]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'New Filter', filters: { status: ['ACTIVE'] } },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(201);
			expect(data.name).toBe('New Filter');
			expect(data.filters).toEqual({ status: ['ACTIVE'] });
		});

		it('should create a filter with custom filterType', async () => {
			mockDb.query.savedFilter.findFirst.mockResolvedValue(null);

			const created = {
				id: 4,
				projectId: 1,
				userId: 'user-1',
				name: 'Run Filter',
				filterType: 'test_runs',
				filters: { environment: ['QA'] }
			};
			mockInsertReturning(mockDb, [created]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'Run Filter', filterType: 'test_runs', filters: { environment: ['QA'] } },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(201);
			expect(data.filterType).toBe('test_runs');
		});

		it('should return 400 when name is missing', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { filters: { status: ['ACTIVE'] } },
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
		});

		it('should return 400 when name is empty', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: '   ', filters: { status: ['ACTIVE'] } },
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
		});

		it('should return 400 when name exceeds 100 characters', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'a'.repeat(101), filters: { status: ['ACTIVE'] } },
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
		});

		it('should return 400 when filters is missing', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'Filter' },
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
		});

		it('should return 400 when filters is not an object', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'Filter', filters: 'invalid' },
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
		});

		it('should return 400 for invalid filter type', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'Filter', filterType: 'invalid_type', filters: { status: ['ACTIVE'] } },
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
		});

		it('should return 409 when filter name already exists', async () => {
			mockDb.query.savedFilter.findFirst.mockResolvedValue(sampleFilters[0]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'Active Cases', filters: { status: ['ACTIVE'] } },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(409);
			expect(data.error).toMatch(/already exists/i);
		});

		it('should trim whitespace from name', async () => {
			mockDb.query.savedFilter.findFirst.mockResolvedValue(null);

			const created = {
				id: 5,
				projectId: 1,
				userId: 'user-1',
				name: 'Trimmed',
				filterType: 'test_cases',
				filters: { status: ['ACTIVE'] }
			};
			mockInsertReturning(mockDb, [created]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: '  Trimmed  ', filters: { status: ['ACTIVE'] } },
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(201);
		});
	});
});
