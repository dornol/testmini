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
	executionComment: {
		id: 'id',
		testExecutionId: 'test_execution_id',
		userId: 'user_id',
		content: 'content',
		parentId: 'parent_id',
		createdAt: 'created_at',
		updatedAt: 'updated_at'
	},
	testExecution: {
		id: 'id',
		testRunId: 'test_run_id'
	},
	testRun: {
		id: 'id',
		projectId: 'project_id'
	},
	user: {
		id: 'id',
		name: 'name',
		email: 'email',
		image: 'image'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	asc: vi.fn((a: unknown) => a),
	isNull: vi.fn((a: unknown) => a)
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' }),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' }),
		parseJsonBody: vi.fn().mockImplementation(async (req: Request) => req.json())
	};
});

const { GET, POST } = await import('./+server');
const { testExecution, testRun, user: userTable } = await import('$lib/server/db/schema');

const PARAMS = { projectId: '1', runId: '50', executionId: '200' };

const sampleComment = {
	id: 1,
	testExecutionId: 200,
	userId: 'user-1',
	content: 'This test is flaky',
	parentId: null,
	createdAt: new Date('2025-01-01'),
	updatedAt: new Date('2025-01-01'),
	userName: 'Test User',
	userEmail: 'test@example.com',
	userImage: null
};

describe('/api/projects/[projectId]/test-runs/[runId]/executions/[executionId]/comments', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.query.executionComment = { findFirst: vi.fn() };
		mockDb.query.user = { findFirst: vi.fn() };
	});

	describe('GET', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'GET', params: PARAMS, user: null });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return 404 when execution not found', async () => {
			// First select (execution verification) returns empty
			mockSelectResult(mockDb, []);

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser
			});

			await expect(GET(event)).rejects.toThrow();
		});

		it('should return comments list successfully', async () => {
			// First call: execution verification, second call: comments list
			let callCount = 0;
			const executionChain = createChainResolving([{ id: 200 }]);
			const commentsChain = createChainResolving([sampleComment]);
			mockDb.select.mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// Execution exists
					return executionChain;
				}
				// Comments
				return commentsChain;
			});

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser
			});

			const response = await GET(event);
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(Array.isArray(body)).toBe(true);
			expect(commentsChain.innerJoin).toHaveBeenCalledWith(userTable, ['user_id', 'id']);
			expect(commentsChain.innerJoin).toHaveBeenCalledWith(testExecution, [
				'test_execution_id',
				'id'
			]);
			expect(commentsChain.innerJoin).toHaveBeenCalledWith(testRun, ['test_run_id', 'id']);
			expect(commentsChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['test_execution_id', 200],
					['test_run_id', 50],
					['project_id', 1]
				])
			);
		});
	});

	describe('POST', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'POST', params: PARAMS, user: null, body: {} });
			await expect(POST(event)).rejects.toThrow();
		});

		it('should return 404 when execution not found', async () => {
			mockSelectResult(mockDb, []);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { content: 'A comment' }
			});

			await expect(POST(event)).rejects.toThrow();
		});

		it('should reject empty content', async () => {
			mockSelectResult(mockDb, [{ id: 200 }]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { content: '' }
			});

			const response = await POST(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Content is required');
		});

		it('should reject non-object request body', async () => {
			mockSelectResult(mockDb, [{ id: 200 }]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: ['A comment']
			});

			const response = await POST(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Invalid request body');
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should reject unknown request fields', async () => {
			mockSelectResult(mockDb, [{ id: 200 }]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { content: 'A comment', visibility: 'public' }
			});

			const response = await POST(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Invalid comment field');
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should reject content exceeding 10000 characters', async () => {
			mockSelectResult(mockDb, [{ id: 200 }]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { content: 'a'.repeat(10001) }
			});

			const response = await POST(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('too long');
		});

		it('should reject reply to non-existent parent', async () => {
			mockSelectResult(mockDb, [{ id: 200 }]);
			mockDb.query.executionComment.findFirst.mockResolvedValue(undefined);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { content: 'Reply text', parentId: 999 }
			});

			const response = await POST(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Parent comment not found');
		});

		it('should reject invalid parentId without querying for a parent comment', async () => {
			mockSelectResult(mockDb, [{ id: 200 }]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { content: 'Reply text', parentId: -1 }
			});

			const response = await POST(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('parentId must be a positive integer');
			expect(mockDb.query.executionComment.findFirst).not.toHaveBeenCalled();
		});

		it('should create comment successfully', async () => {
			mockSelectResult(mockDb, [{ id: 200 }]);
			const insertedComment = {
				id: 2,
				testExecutionId: 200,
				userId: 'user-1',
				content: 'New comment',
				parentId: null,
				createdAt: new Date(),
				updatedAt: new Date()
			};
			mockInsertReturning(mockDb, [insertedComment]);
			mockDb.query.user.findFirst.mockResolvedValue({
				id: 'user-1',
				name: 'Test User',
				email: 'test@example.com',
				image: null
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { content: 'New comment' }
			});

			const response = await POST(event);
			expect(response.status).toBe(201);
			const body = await response.json();
			expect(body.content).toBe('New comment');
			expect(body.userName).toBe('Test User');
		});

		it('should return 500 when comment insert returns no row', async () => {
			mockSelectResult(mockDb, [{ id: 200 }]);
			mockInsertReturning(mockDb, []);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { content: 'New comment' }
			});

			await expect(POST(event)).rejects.toMatchObject({ status: 500 });
			expect(mockDb.query.user.findFirst).not.toHaveBeenCalled();
		});

		it('should create reply comment with parentId', async () => {
			mockSelectResult(mockDb, [{ id: 200 }]);
			mockDb.query.executionComment.findFirst.mockResolvedValue({
				id: 1,
				testExecutionId: 200,
				parentId: null
			});
			const insertedReply = {
				id: 3,
				testExecutionId: 200,
				userId: 'user-1',
				content: 'Reply',
				parentId: 1,
				createdAt: new Date(),
				updatedAt: new Date()
			};
			mockInsertReturning(mockDb, [insertedReply]);
			mockDb.query.user.findFirst.mockResolvedValue({
				id: 'user-1',
				name: 'Test User',
				email: 'test@example.com',
				image: null
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { content: 'Reply', parentId: 1 }
			});

			const response = await POST(event);
			expect(response.status).toBe(201);
			const body = await response.json();
			expect(body.parentId).toBe(1);
		});
	});
});

/** Helper to create a chainable that resolves to the given result */
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
		chain[m] = vi.fn().mockImplementation(() => chain);
	}
	chain.then = (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve);
	return chain;
}
