import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	createMockDb,
	mockSelectResult,
	mockInsertReturning
} from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	exploratorySession: {
		id: 'id',
		projectId: 'project_id',
		title: 'title',
		charter: 'charter',
		status: 'status',
		startedAt: 'started_at',
		pausedDuration: 'paused_duration',
		completedAt: 'completed_at',
		environment: 'environment',
		tags: 'tags',
		createdBy: 'created_by',
		createdAt: 'created_at'
	},
	sessionNote: {
		id: 'id',
		sessionId: 'session_id'
	},
	user: {
		id: 'id',
		name: 'name'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	desc: vi.fn((a: unknown) => a),
	count: vi.fn(() => 'count'),
	sql: Object.assign((..._args: unknown[]) => ({ as: vi.fn() }), { raw: vi.fn() })
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' }),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});

const { GET, POST } = await import('./+server');
const drizzle = await import('drizzle-orm');

const PARAMS = { projectId: '1' };

const sampleSession = {
	id: 1,
	projectId: 1,
	title: 'Explore login flow',
	charter: 'Test all login scenarios',
	status: 'ACTIVE',
	startedAt: new Date('2025-06-01T10:00:00Z'),
	pausedDuration: 0,
	completedAt: null,
	environment: 'Chrome / macOS',
	tags: ['auth', 'login'],
	createdBy: 'Test User',
	createdById: 'user-1',
	noteCount: 3
};

describe('/api/projects/[projectId]/exploratory-sessions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'GET', params: PARAMS, user: null });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should list sessions', async () => {
			// First call: sessions list; second call: total count
			let callCount = 0;
			mockDb.select.mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					return createChainResolving([sampleSession]);
				}
				return createChainResolving([{ total: 1 }]);
			});

			const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
			const response = await GET(event);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.sessions).toHaveLength(1);
			expect(body.sessions[0].title).toBe('Explore login flow');
			expect(body.total).toBe(1);
		});

		it('should return empty list when no sessions exist', async () => {
			let callCount = 0;
			mockDb.select.mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					return createChainResolving([]);
				}
				return createChainResolving([{ total: 0 }]);
			});

			const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });
			const response = await GET(event);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.sessions).toHaveLength(0);
			expect(body.total).toBe(0);
		});

		it('should return 400 for invalid status before querying sessions', async () => {
			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser,
				searchParams: { status: 'INVALID_STATUS' }
			});
			const response = await GET(event);

			expect(response.status).toBe(400);
			expect(mockDb.select).not.toHaveBeenCalled();
		});

		it('should pass status filter parameter', async () => {
			let callCount = 0;
			mockDb.select.mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					return createChainResolving([sampleSession]);
				}
				return createChainResolving([{ total: 1 }]);
			});

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser,
				searchParams: { status: 'ACTIVE' }
			});
			const response = await GET(event);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.sessions).toHaveLength(1);
			expect(drizzle.eq).toHaveBeenCalledWith('status', 'ACTIVE');
		});

		it('should cap large limits and apply validated offset', async () => {
			const sessionsChain = createChainResolving([]);
			const countChain = createChainResolving([{ total: 0 }]);
			mockDb.select.mockReturnValueOnce(sessionsChain as never);
			mockDb.select.mockReturnValueOnce(countChain as never);

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser,
				searchParams: { limit: '999', offset: '30' }
			});
			const response = await GET(event);

			expect(response.status).toBe(200);
			expect(sessionsChain.limit).toHaveBeenCalledWith(50);
			expect(sessionsChain.offset).toHaveBeenCalledWith(30);
		});

		it('should return 400 for invalid limit before querying sessions', async () => {
			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser,
				searchParams: { limit: 'abc' }
			});
			const response = await GET(event);

			expect(response.status).toBe(400);
			expect(mockDb.select).not.toHaveBeenCalled();
		});

		it('should return 400 for zero limit before querying sessions', async () => {
			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser,
				searchParams: { limit: '0' }
			});
			const response = await GET(event);

			expect(response.status).toBe(400);
			expect(mockDb.select).not.toHaveBeenCalled();
		});

		it('should return 400 for invalid offset before querying sessions', async () => {
			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser,
				searchParams: { offset: 'abc' }
			});
			const response = await GET(event);

			expect(response.status).toBe(400);
			expect(mockDb.select).not.toHaveBeenCalled();
		});

		it('should return 400 for negative offset before querying sessions', async () => {
			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser,
				searchParams: { offset: '-1' }
			});
			const response = await GET(event);

			expect(response.status).toBe(400);
			expect(mockDb.select).not.toHaveBeenCalled();
		});

		it.each([
			['limit', '01'],
			['limit', '1e3'],
			['limit', '+1'],
			['limit', ' 1'],
			['offset', '01'],
			['offset', '1e3'],
			['offset', '+1'],
			['offset', '10 ']
		])(
			'should return 400 for non-canonical %s value %s before querying sessions',
			async (key, value) => {
				const event = createMockEvent({
					method: 'GET',
					params: PARAMS,
					user: testUser,
					searchParams: { [key]: value }
				});
				const response = await GET(event);

				expect(response.status).toBe(400);
				expect(mockDb.select).not.toHaveBeenCalled();
			}
		);
	});

	describe('POST', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: null,
				body: { title: 'Test' }
			});
			await expect(POST(event)).rejects.toThrow();
		});

		it('should reject missing title', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { title: '' }
			});

			const response = await POST(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Title is required');
		});

		it('should reject title exceeding 500 characters', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { title: 'x'.repeat(501) }
			});

			const response = await POST(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('500 characters');
		});

		it('should reject non-object request bodies', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: ['invalid']
			});

			const response = await POST(event);
			expect(response.status).toBe(400);
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should reject unknown request fields', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { title: 'Session', owner: 'qa' }
			});

			const response = await POST(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Invalid exploratory session field');
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should reject non-string optional fields', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { title: 'Session', charter: { nested: true } }
			});

			const response = await POST(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('charter');
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should reject invalid tags', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { title: 'Session', tags: ['valid', '   '] }
			});

			const response = await POST(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('tags[1]');
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should create session successfully with 201', async () => {
			const createdSession = {
				id: 1,
				projectId: 1,
				title: 'Explore login flow',
				charter: 'Test all login scenarios',
				status: 'ACTIVE',
				environment: 'Chrome / macOS',
				tags: ['auth'],
				createdBy: 'user-1',
				startedAt: new Date(),
				pausedDuration: 0,
				completedAt: null
			};
			mockInsertReturning(mockDb, [createdSession]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: {
					title: 'Explore login flow',
					charter: 'Test all login scenarios',
					environment: 'Chrome / macOS',
					tags: ['auth']
				}
			});

			const response = await POST(event);
			expect(response.status).toBe(201);

			const body = await response.json();
			expect(body.title).toBe('Explore login flow');
			expect(body.charter).toBe('Test all login scenarios');
		});

		it('should reject invalid JSON body (returns 400)', async () => {
			const url = new URL('http://localhost:5173/api/test');
			const request = new Request(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: 'not valid json{'
			});
			const event = {
				request,
				url,
				params: PARAMS,
				locals: {
					user: testUser,
					session: { id: 'session-1' },
					requestId: 'test-request-id'
				},
				cookies: {
					get: () => undefined,
					set: () => {},
					delete: () => {},
					getAll: () => [],
					serialize: () => ''
				},
				getClientAddress: () => '127.0.0.1',
				platform: undefined,
				route: { id: '' },
				isDataRequest: false,
				isSubRequest: false,
				fetch: globalThis.fetch
			} as never;

			await expect(POST(event)).rejects.toThrow();
		});

		it('should trim whitespace from title', async () => {
			const createdSession = {
				id: 3,
				projectId: 1,
				title: 'Trimmed title',
				charter: null,
				status: 'ACTIVE',
				environment: null,
				tags: [],
				createdBy: 'user-1',
				startedAt: new Date(),
				pausedDuration: 0,
				completedAt: null
			};
			mockInsertReturning(mockDb, [createdSession]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { title: '   Trimmed title   ' }
			});

			const response = await POST(event);
			expect(response.status).toBe(201);

			const body = await response.json();
			expect(body.title).toBe('Trimmed title');
			// Verify the db insert was called (title was accepted after trimming)
			expect(mockDb.insert).toHaveBeenCalled();
		});

		it('should trim optional text fields and tags before saving', async () => {
			const createdSession = {
				id: 4,
				projectId: 1,
				title: 'Trimmed',
				charter: 'Charter',
				status: 'ACTIVE',
				environment: 'Safari',
				tags: ['auth', 'ui'],
				createdBy: 'user-1',
				startedAt: new Date(),
				pausedDuration: 0,
				completedAt: null
			};
			const insertChain = mockInsertReturning(mockDb, [createdSession]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: {
					title: ' Trimmed ',
					charter: ' Charter ',
					environment: ' Safari ',
					tags: [' auth ', ' ui ']
				}
			});

			const response = await POST(event);
			expect(response.status).toBe(201);
			expect(insertChain.values).toHaveBeenCalledWith(
				expect.objectContaining({
					title: 'Trimmed',
					charter: 'Charter',
					environment: 'Safari',
					tags: ['auth', 'ui']
				})
			);
		});

		it('should use default values when optional fields are omitted', async () => {
			const createdSession = {
				id: 2,
				projectId: 1,
				title: 'Quick session',
				charter: null,
				status: 'ACTIVE',
				environment: null,
				tags: [],
				createdBy: 'user-1',
				startedAt: new Date(),
				pausedDuration: 0,
				completedAt: null
			};
			mockInsertReturning(mockDb, [createdSession]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { title: 'Quick session' }
			});

			const response = await POST(event);
			expect(response.status).toBe(201);

			const body = await response.json();
			expect(body.charter).toBeNull();
			expect(body.environment).toBeNull();
			expect(body.tags).toEqual([]);
		});
	});
});

/** Helper to create a chainable mock that resolves to the given result */
function createChainResolving(result: unknown[]) {
	const chain: Record<string, unknown> = {};
	const methods = [
		'from',
		'where',
		'orderBy',
		'limit',
		'offset',
		'innerJoin',
		'leftJoin',
		'groupBy',
		'as',
		'set',
		'values',
		'returning',
		'onConflictDoNothing',
		'onConflictDoUpdate'
	];
	for (const m of methods) {
		chain[m] = vi.fn().mockReturnValue(chain);
	}
	chain.then = (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve);
	return chain;
}
