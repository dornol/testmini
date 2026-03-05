import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockUpdateReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser, sampleTestCase } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testCase: { id: 'id', projectId: 'project_id' },
	testCaseComment: {
		id: 'id',
		testCaseId: 'test_case_id',
		userId: 'user_id',
		content: 'content',
		parentId: 'parent_id',
		createdAt: 'created_at',
		updatedAt: 'updated_at'
	},
	projectMember: { projectId: 'project_id', userId: 'user_id', role: 'role' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args)
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		isGlobalAdmin: vi.fn().mockReturnValue(false)
	};
});

const { PATCH, DELETE } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1', testCaseId: '10', commentId: '1' };

const authorComment = {
	id: 1,
	testCaseId: 10,
	userId: testUser.id,
	content: 'Original comment',
	parentId: null,
	createdAt: new Date('2025-01-01'),
	updatedAt: new Date('2025-01-01')
};

const otherUserComment = {
	...authorComment,
	userId: 'other-user-id'
};

describe('/api/projects/[projectId]/test-cases/[testCaseId]/comments/[commentId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.isGlobalAdmin).mockReturnValue(false);
		mockDb.query.testCase = { findFirst: vi.fn().mockResolvedValue(sampleTestCase) };
		mockDb.query.testCaseComment = { findFirst: vi.fn().mockResolvedValue(authorComment) };
		mockDb.query.projectMember = { findFirst: vi.fn().mockResolvedValue({ role: 'QA' }) };
	});

	describe('PATCH', () => {
		it('should allow author to edit their own comment', async () => {
			const updated = { ...authorComment, content: 'Updated comment' };
			mockUpdateReturning(mockDb, [updated]);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { content: 'Updated comment' },
				user: testUser
			});
			const response = await PATCH(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.content).toBe('Updated comment');
		});

		it('should allow global admin to edit any comment', async () => {
			vi.mocked(authUtils.isGlobalAdmin).mockReturnValue(true);
			mockDb.query.testCaseComment.findFirst.mockResolvedValue(otherUserComment);

			const updated = { ...otherUserComment, content: 'Admin edit' };
			mockUpdateReturning(mockDb, [updated]);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { content: 'Admin edit' },
				user: adminUser
			});
			const response = await PATCH(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.content).toBe('Admin edit');
		});

		it('should return 403 when non-author tries to edit', async () => {
			mockDb.query.testCaseComment.findFirst.mockResolvedValue(otherUserComment);
			vi.mocked(authUtils.isGlobalAdmin).mockReturnValue(false);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { content: 'Unauthorized edit' },
				user: testUser
			});
			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should return 400 when content is empty', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { content: '' },
				user: testUser
			});
			const response = await PATCH(event);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toMatch(/content/i);
		});

		it('should return 400 when content is whitespace only', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { content: '   ' },
				user: testUser
			});
			const response = await PATCH(event);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toMatch(/content/i);
		});

		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { content: 'Updated comment' },
				user: null
			});
			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should return 404 when comment not found', async () => {
			mockDb.query.testCaseComment.findFirst.mockResolvedValue(null);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { content: 'Updated comment' },
				user: testUser
			});
			await expect(PATCH(event)).rejects.toThrow();
		});
	});

	describe('DELETE', () => {
		it('should allow author to delete their own comment', async () => {
			const deleteChain = {
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.delete.mockReturnValue(deleteChain as never);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser
			});
			const response = await DELETE(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);
		});

		it('should allow PROJECT_ADMIN to delete any comment', async () => {
			mockDb.query.testCaseComment.findFirst.mockResolvedValue(otherUserComment);
			mockDb.query.projectMember.findFirst.mockResolvedValue({ role: 'PROJECT_ADMIN' });

			const deleteChain = {
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.delete.mockReturnValue(deleteChain as never);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser
			});
			const response = await DELETE(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);
		});

		it('should allow global admin to delete any comment', async () => {
			vi.mocked(authUtils.isGlobalAdmin).mockReturnValue(true);
			mockDb.query.testCaseComment.findFirst.mockResolvedValue(otherUserComment);

			const deleteChain = {
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.delete.mockReturnValue(deleteChain as never);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: adminUser
			});
			const response = await DELETE(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);
		});

		it('should return 403 for other users (non-author, non-admin)', async () => {
			mockDb.query.testCaseComment.findFirst.mockResolvedValue(otherUserComment);
			vi.mocked(authUtils.isGlobalAdmin).mockReturnValue(false);
			mockDb.query.projectMember.findFirst.mockResolvedValue({ role: 'QA' });

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser
			});
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 403 when user has no project membership', async () => {
			mockDb.query.testCaseComment.findFirst.mockResolvedValue(otherUserComment);
			vi.mocked(authUtils.isGlobalAdmin).mockReturnValue(false);
			mockDb.query.projectMember.findFirst.mockResolvedValue(null);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser
			});
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: null
			});
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 404 when comment not found', async () => {
			mockDb.query.testCaseComment.findFirst.mockResolvedValue(null);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser
			});
			await expect(DELETE(event)).rejects.toThrow();
		});
	});
});
