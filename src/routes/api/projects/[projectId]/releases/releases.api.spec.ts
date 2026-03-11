import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	release: {
		id: 'id',
		name: 'name',
		version: 'version',
		description: 'description',
		status: 'status',
		targetDate: 'target_date',
		releaseDate: 'release_date',
		projectId: 'project_id',
		createdBy: 'created_by',
		createdAt: 'created_at',
		updatedAt: 'updated_at'
	},
	testPlan: { id: 'id', releaseId: 'release_id' },
	testRun: { id: 'id', releaseId: 'release_id' },
	testExecution: { id: 'id', testRunId: 'test_run_id', status: 'status' },
	user: { id: 'id', name: 'name' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({
			as: () => ({ sql: strings, values })
		}),
		{ raw: (s: string) => s }
	),
	count: vi.fn()
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' }),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});

const { GET, POST } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1' };

const sampleRelease = {
	id: 1,
	name: 'v1.0.0',
	version: '1.0.0',
	description: 'First release',
	status: 'PLANNING',
	targetDate: null,
	releaseDate: null,
	createdBy: 'Test User',
	createdAt: new Date('2025-01-01'),
	planCount: 2,
	runCount: 3
};

describe('/api/projects/[projectId]/releases', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectAccess).mockResolvedValue({ role: 'QA' });
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
	});

	describe('GET', () => {
		it('should return list of releases', async () => {
			mockSelectResult(mockDb, [sampleRelease]);

			const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(Array.isArray(data)).toBe(true);
			expect(data[0].name).toBe('v1.0.0');
		});

		it('should return empty array when no releases', async () => {
			mockSelectResult(mockDb, []);

			const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data).toEqual([]);
		});

		it('should support status filter', async () => {
			mockSelectResult(mockDb, [sampleRelease]);

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser,
				searchParams: { status: 'PLANNING' }
			});
			const response = await GET(event);

			expect(response.status).toBe(200);
		});

		it('should return 401 when unauthenticated', async () => {
			const event = createMockEvent({ method: 'GET', params: PARAMS, user: null });
			await expect(GET(event)).rejects.toThrow();
		});
	});

	describe('POST', () => {
		it('should create a release with required fields', async () => {
			const created = {
				id: 1,
				name: 'v2.0.0',
				version: null,
				description: null,
				status: 'PLANNING',
				targetDate: null,
				releaseDate: null,
				projectId: 1,
				createdBy: 'user-1',
				createdAt: new Date()
			};
			mockInsertReturning(mockDb, [created]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'v2.0.0' },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(201);
			expect(data.name).toBe('v2.0.0');
		});

		it('should create a release with all fields', async () => {
			const created = {
				id: 2,
				name: 'v3.0.0',
				version: '3.0.0',
				description: 'Major release',
				status: 'IN_PROGRESS',
				targetDate: new Date('2025-06-01'),
				releaseDate: null,
				projectId: 1,
				createdBy: 'user-1',
				createdAt: new Date()
			};
			mockInsertReturning(mockDb, [created]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: {
					name: 'v3.0.0',
					version: '3.0.0',
					description: 'Major release',
					status: 'IN_PROGRESS',
					targetDate: '2025-06-01'
				},
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(201);
		});

		it('should return 400 when name is missing', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: {},
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
		});

		it('should return 400 for invalid status', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'v1.0', status: 'INVALID' },
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
		});

		it('should return 401 when unauthenticated', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'v1.0' },
				user: null
			});
			await expect(POST(event)).rejects.toThrow();
		});

		it('should return 403 for insufficient role', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { name: 'v1.0' },
				user: testUser
			});
			await expect(POST(event)).rejects.toThrow();
		});
	});
});
