import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	createMockDb,
	mockSelectResult,
	mockUpdateReturning
} from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser } from '$lib/server/test-helpers/fixtures';

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
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }))
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' }),
		parseJsonBody: vi.fn().mockImplementation(async (req: Request) => req.json())
	};
});

const { PATCH, DELETE } = await import('./+server');

const PARAMS = { projectId: '1', runId: '50', executionId: '200', commentId: '1' };

const sampleComment = {
	id: 1,
	testExecutionId: 200,
	userId: 'user-1',
	content: 'Original comment',
	parentId: null,
	createdAt: new Date('2025-01-01'),
	updatedAt: new Date('2025-01-01')
};

function mockDeleteReturningSequence(...results: unknown[][]) {
	let call = 0;
	const chains: Array<{ where: ReturnType<typeof vi.fn>; returning: ReturnType<typeof vi.fn> }> =
		[];
	mockDb.delete.mockImplementation(() => {
		const chain = {
			where: vi.fn().mockReturnThis(),
			returning: vi.fn().mockResolvedValue(results[call++] ?? [])
		};
		chains.push(chain);
		return chain as never;
	});
	return chains;
}

describe('/api/projects/[projectId]/test-runs/[runId]/executions/[executionId]/comments/[commentId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.query.executionComment = { findFirst: vi.fn() };
	});

	describe('PATCH', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'PATCH', params: PARAMS, user: null, body: {} });
			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should return 404 when comment not found', async () => {
			mockSelectResult(mockDb, []);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { content: 'Updated' }
			});

			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should return 404 when comment is outside the requested project/run/execution scope', async () => {
			mockSelectResult(mockDb, []);

			const event = createMockEvent({
				method: 'PATCH',
				params: { projectId: '999', runId: '50', executionId: '200', commentId: '1' },
				user: testUser,
				body: { content: 'Updated' }
			});

			await expect(PATCH(event)).rejects.toThrow();
			expect(mockDb.select).toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should return 403 when user is not the author', async () => {
			mockSelectResult(mockDb, [
				{
					...sampleComment,
					userId: 'other-user'
				}
			]);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { content: 'Updated' }
			});

			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should allow admin to edit any comment', async () => {
			mockSelectResult(mockDb, [
				{
					...sampleComment,
					userId: 'other-user'
				}
			]);
			const updatedComment = { ...sampleComment, content: 'Admin edit' };
			mockUpdateReturning(mockDb, [updatedComment]);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: adminUser,
				body: { content: 'Admin edit' }
			});

			const response = await PATCH(event);
			expect(response.status).toBe(200);
		});

		it('should reject empty content', async () => {
			mockSelectResult(mockDb, [sampleComment]);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { content: '' }
			});

			const response = await PATCH(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Content is required');
		});

		it('should reject content exceeding 10000 characters', async () => {
			mockSelectResult(mockDb, [sampleComment]);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { content: 'x'.repeat(10001) }
			});

			const response = await PATCH(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('too long');
		});

		it('should reject non-object request body', async () => {
			mockSelectResult(mockDb, [sampleComment]);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: null
			});

			const response = await PATCH(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Invalid request body');
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should reject unknown request fields', async () => {
			mockSelectResult(mockDb, [sampleComment]);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { content: 'Updated comment', visibility: 'public' }
			});

			const response = await PATCH(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Invalid comment field');
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should update comment successfully', async () => {
			mockSelectResult(mockDb, [sampleComment]);
			const updatedComment = { ...sampleComment, content: 'Updated comment' };
			const updateChain = mockUpdateReturning(mockDb, [updatedComment]);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { content: 'Updated comment' }
			});

			const response = await PATCH(event);
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.content).toBe('Updated comment');
			expect(updateChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 1],
					['test_execution_id', 200],
					expect.objectContaining({ values: [200, 50, 1] })
				])
			);
		});

		it('should return 404 when comment disappears before update', async () => {
			mockSelectResult(mockDb, [sampleComment]);
			mockUpdateReturning(mockDb, []);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { content: 'Updated comment' }
			});

			await expect(PATCH(event)).rejects.toMatchObject({ status: 404 });
		});

		it('should reject invalid comment ID', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: { ...PARAMS, commentId: 'abc' },
				user: testUser,
				body: { content: 'Test' }
			});

			await expect(PATCH(event)).rejects.toThrow();
		});
	});

	describe('DELETE', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: null });
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 404 when comment not found', async () => {
			mockSelectResult(mockDb, []);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser
			});

			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 403 when user is not the author', async () => {
			mockSelectResult(mockDb, [
				{
					...sampleComment,
					userId: 'other-user'
				}
			]);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser
			});

			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should allow admin to delete any comment', async () => {
			mockSelectResult(mockDb, [
				{
					...sampleComment,
					userId: 'other-user'
				}
			]);
			mockDeleteReturningSequence([], [sampleComment]);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: adminUser
			});

			const response = await DELETE(event);
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.success).toBe(true);
		});

		it('should delete comment and its replies', async () => {
			mockSelectResult(mockDb, [sampleComment]);
			const deleteChains = mockDeleteReturningSequence([], [sampleComment]);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser
			});

			const response = await DELETE(event);
			expect(response.status).toBe(200);
			// Should call delete twice: once for replies, once for the comment itself
			expect(mockDb.delete).toHaveBeenCalledTimes(2);
			const replyDeleteChain = deleteChains[0];
			const commentDeleteChain = deleteChains[1];
			expect(replyDeleteChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['parent_id', 1],
					['test_execution_id', 200],
					expect.objectContaining({ values: [200, 50, 1] })
				])
			);
			expect(commentDeleteChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 1],
					['test_execution_id', 200],
					expect.objectContaining({ values: [200, 50, 1] })
				])
			);
		});

		it('should return 404 when comment disappears before delete', async () => {
			mockSelectResult(mockDb, [sampleComment]);
			mockDeleteReturningSequence([], []);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser
			});

			await expect(DELETE(event)).rejects.toMatchObject({ status: 404 });
			expect(mockDb.delete).toHaveBeenCalledTimes(2);
		});
	});
});
