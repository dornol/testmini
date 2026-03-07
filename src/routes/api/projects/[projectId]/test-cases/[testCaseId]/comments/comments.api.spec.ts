import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser, sampleTestCase } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testCase: { id: 'id', projectId: 'project_id', testCaseId: 'test_case_id' },
	testCaseComment: {
		id: 'id',
		testCaseId: 'test_case_id',
		userId: 'user_id',
		content: 'content',
		parentId: 'parent_id',
		createdAt: 'created_at',
		updatedAt: 'updated_at'
	},
	user: { id: 'id', name: 'name', email: 'email', image: 'image' },
	projectMember: { projectId: 'project_id', userId: 'user_id' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	asc: vi.fn((a: unknown) => ['asc', a]),
	isNull: vi.fn((a: unknown) => ['isNull', a])
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' }),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});

const { GET, POST } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1', testCaseId: '10' };

const sampleComment = {
	id: 1,
	testCaseId: 10,
	userId: testUser.id,
	content: 'This is a comment',
	parentId: null,
	createdAt: new Date('2025-01-01'),
	updatedAt: new Date('2025-01-01')
};

describe('/api/projects/[projectId]/test-cases/[testCaseId]/comments', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
		mockDb.query.testCase = { findFirst: vi.fn().mockResolvedValue(sampleTestCase) };
		mockDb.query.testCaseComment = { findFirst: vi.fn().mockResolvedValue(null) };
		mockDb.query.user = { findFirst: vi.fn().mockResolvedValue(testUser) };
	});

	describe('GET', () => {
		it('should return comments for test case', async () => {
			const comments = [
				{
					...sampleComment,
					userName: testUser.name,
					userEmail: testUser.email,
					userImage: testUser.image
				}
			];
			mockSelectResult(mockDb, comments);

			const event = createMockEvent({ params: PARAMS, user: testUser });
			const response = await GET(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(Array.isArray(body)).toBe(true);
			expect(body).toHaveLength(1);
			expect(body[0].content).toBe('This is a comment');
		});

		it('should return empty array when no comments exist', async () => {
			mockSelectResult(mockDb, []);

			const event = createMockEvent({ params: PARAMS, user: testUser });
			const response = await GET(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body).toEqual([]);
		});

		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ params: PARAMS, user: null });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return 404 when test case not found', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(null);

			const event = createMockEvent({ params: PARAMS, user: testUser });
			await expect(GET(event)).rejects.toThrow();
		});
	});

	describe('POST', () => {
		it('should create comment for non-VIEWER', async () => {
			const inserted = { ...sampleComment, id: 2 };
			mockInsertReturning(mockDb, [inserted]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { content: 'New comment' },
				user: testUser
			});
			const response = await POST(event);
			const body = await response.json();

			expect(response.status).toBe(201);
			expect(body.content).toBe(inserted.content);
		});

		it('should return 403 for VIEWER role', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { content: 'New comment' },
				user: testUser
			});
			await expect(POST(event)).rejects.toThrow();
		});

		it('should validate content (non-empty)', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { content: '' },
				user: testUser
			});
			const response = await POST(event);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toMatch(/content/i);
		});

		it('should return 400 when content is whitespace only', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { content: '   ' },
				user: testUser
			});
			const response = await POST(event);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toMatch(/content/i);
		});

		it('should return 400 when content is missing', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: {},
				user: testUser
			});
			const response = await POST(event);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toMatch(/content/i);
		});

		it('should validate parentId belongs to same test case', async () => {
			// parentId given but findFirst returns null (not found on this test case)
			mockDb.query.testCaseComment.findFirst.mockResolvedValue(null);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { content: 'Reply comment', parentId: 999 },
				user: testUser
			});
			const response = await POST(event);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toMatch(/parent/i);
		});

		it('should create a reply when parentId belongs to the same test case', async () => {
			const parentComment = { ...sampleComment, id: 1 };
			mockDb.query.testCaseComment.findFirst.mockResolvedValue(parentComment);

			const inserted = { ...sampleComment, id: 3, parentId: 1 };
			mockInsertReturning(mockDb, [inserted]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { content: 'Reply comment', parentId: 1 },
				user: testUser
			});
			const response = await POST(event);
			const body = await response.json();

			expect(response.status).toBe(201);
			expect(body.parentId).toBe(1);
		});

		it('should return 404 when test case not found', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(null);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { content: 'New comment' },
				user: testUser
			});
			await expect(POST(event)).rejects.toThrow();
		});
	});
});
