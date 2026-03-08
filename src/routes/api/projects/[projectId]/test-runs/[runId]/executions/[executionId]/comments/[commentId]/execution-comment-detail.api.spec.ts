import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockUpdateReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	executionComment: {
		id: 'id',
		testExecutionId: 'test_execution_id',
		userId: 'user_id',
		content: 'content',
		parentId: 'parent_id',
		createdAt: 'created_at',
		updatedAt: 'updated_at'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args)
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>(
		'$lib/server/auth-utils'
	);
	return {
		...actual,
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
			mockDb.query.executionComment.findFirst.mockResolvedValue(undefined);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { content: 'Updated' }
			});

			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should return 403 when user is not the author', async () => {
			mockDb.query.executionComment.findFirst.mockResolvedValue({
				...sampleComment,
				userId: 'other-user'
			});

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { content: 'Updated' }
			});

			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should allow admin to edit any comment', async () => {
			mockDb.query.executionComment.findFirst.mockResolvedValue({
				...sampleComment,
				userId: 'other-user'
			});
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
			mockDb.query.executionComment.findFirst.mockResolvedValue(sampleComment);

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
			mockDb.query.executionComment.findFirst.mockResolvedValue(sampleComment);

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

		it('should update comment successfully', async () => {
			mockDb.query.executionComment.findFirst.mockResolvedValue(sampleComment);
			const updatedComment = { ...sampleComment, content: 'Updated comment' };
			mockUpdateReturning(mockDb, [updatedComment]);

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
			mockDb.query.executionComment.findFirst.mockResolvedValue(undefined);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser
			});

			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 403 when user is not the author', async () => {
			mockDb.query.executionComment.findFirst.mockResolvedValue({
				...sampleComment,
				userId: 'other-user'
			});

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser
			});

			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should allow admin to delete any comment', async () => {
			mockDb.query.executionComment.findFirst.mockResolvedValue({
				...sampleComment,
				userId: 'other-user'
			});

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
			mockDb.query.executionComment.findFirst.mockResolvedValue(sampleComment);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser
			});

			const response = await DELETE(event);
			expect(response.status).toBe(200);
			// Should call delete twice: once for replies, once for the comment itself
			expect(mockDb.delete).toHaveBeenCalledTimes(2);
		});
	});
});
