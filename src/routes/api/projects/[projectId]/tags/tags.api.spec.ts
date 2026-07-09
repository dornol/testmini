import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockRequireTestCase = vi.fn().mockResolvedValue({ id: 10, projectId: 1 });

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	tag: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		color: 'color',
		createdBy: 'created_by'
	},
	testCaseTag: {
		testCaseId: 'test_case_id',
		tagId: 'tag_id'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args)
}));

vi.mock('$lib/server/auth-utils', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});

vi.mock('$lib/server/cache', () => ({
	cacheDelete: vi.fn()
}));
vi.mock('$lib/server/queries', () => ({
	requireTestCase: mockRequireTestCase
}));

const { POST } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');
const { cacheDelete } = await import('$lib/server/cache');

describe('/api/projects/[projectId]/tags', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'QA' });
		mockDb.query.tag = { findFirst: vi.fn().mockResolvedValue(null) };
		mockDb.query.testCaseTag = { findFirst: vi.fn().mockResolvedValue(null) };
		mockRequireTestCase.mockResolvedValue({ id: 10, projectId: 1 });
	});

	describe('POST - create tag', () => {
		it('should create a new tag successfully', async () => {
			const created = { id: 1, name: 'Bug', color: '#ff0000' };
			mockInsertReturning(mockDb, [created]);

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: 'Bug', color: '#ff0000' },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.tag).toEqual({ id: 1, name: 'Bug', color: '#ff0000' });
			expect(data.assigned).toBe(false);
		});

		it('should create tag and assign to test case when testCaseId provided', async () => {
			const created = { id: 2, name: 'Feature', color: '#00ff00' };
			const returning = vi.fn().mockResolvedValue([created]);
			const tagValues = vi.fn(() => ({ returning }));
			const assignmentReturning = vi.fn().mockResolvedValue([{ testCaseId: 10, tagId: 2 }]);
			const assignmentValues = vi.fn(() => ({ returning: assignmentReturning }));
			const txInsert = vi
				.fn()
				.mockReturnValueOnce({ values: tagValues })
				.mockReturnValueOnce({ values: assignmentValues });
			mockDb.transaction.mockImplementationOnce(async (fn) => fn({ insert: txInsert }));

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: 'Feature', color: '#00ff00', testCaseId: 10 },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.tag.name).toBe('Feature');
			expect(data.assigned).toBe(true);
			expect(mockRequireTestCase).toHaveBeenCalledWith(10, 1);
			expect(mockDb.transaction).toHaveBeenCalledTimes(1);
			expect(txInsert).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 'id' }));
			expect(tagValues).toHaveBeenCalledWith({
				projectId: 1,
				name: 'Feature',
				color: '#00ff00',
				createdBy: testUser.id
			});
			expect(txInsert).toHaveBeenNthCalledWith(2, {
				testCaseId: 'test_case_id',
				tagId: 'tag_id'
			});
			expect(assignmentValues).toHaveBeenCalledWith({ testCaseId: 10, tagId: 2 });
			expect(assignmentReturning).toHaveBeenCalled();
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should return 500 when tag insert returns no created tag', async () => {
			mockInsertReturning(mockDb, []);

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: 'Bug', color: '#ff0000' },
				user: testUser
			});

			await expect(POST(event)).rejects.toMatchObject({ status: 500 });
			expect(cacheDelete).not.toHaveBeenCalled();
		});

		it('should return 500 when transaction tag insert returns no created tag', async () => {
			const returning = vi.fn().mockResolvedValue([]);
			const tagValues = vi.fn(() => ({ returning }));
			const txInsert = vi.fn().mockReturnValueOnce({ values: tagValues });
			mockDb.transaction.mockImplementationOnce(async (fn) => fn({ insert: txInsert }));

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: 'Feature', color: '#00ff00', testCaseId: 10 },
				user: testUser
			});

			await expect(POST(event)).rejects.toMatchObject({ status: 500 });
			expect(txInsert).toHaveBeenCalledTimes(1);
			expect(cacheDelete).not.toHaveBeenCalled();
		});

		it('should return 500 when transaction assignment insert returns no assignment', async () => {
			const created = { id: 2, name: 'Feature', color: '#00ff00' };
			const tagReturning = vi.fn().mockResolvedValue([created]);
			const tagValues = vi.fn(() => ({ returning: tagReturning }));
			const assignmentReturning = vi.fn().mockResolvedValue([]);
			const assignmentValues = vi.fn(() => ({ returning: assignmentReturning }));
			const txInsert = vi
				.fn()
				.mockReturnValueOnce({ values: tagValues })
				.mockReturnValueOnce({ values: assignmentValues });
			mockDb.transaction.mockImplementationOnce(async (fn) => fn({ insert: txInsert }));

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: 'Feature', color: '#00ff00', testCaseId: 10 },
				user: testUser
			});

			await expect(POST(event)).rejects.toMatchObject({ status: 500 });
			expect(cacheDelete).not.toHaveBeenCalled();
		});

		it('should return 400 for missing name', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { color: '#ff0000' },
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
		});

		it('should return 400 for empty name', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: '', color: '#ff0000' },
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
		});

		it('should return 400 for invalid color format', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: 'Tag', color: 'invalid' },
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
		});

		it('should return 400 when request body is not an object', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: ['Tag'],
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toMatch(/request body/i);
			expect(mockDb.query.tag.findFirst).not.toHaveBeenCalled();
		});

		it('should return 400 when request body has unknown fields', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: 'Tag', color: '#ff0000', description: 'unexpected' },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain('Invalid tag field');
			expect(mockDb.query.tag.findFirst).not.toHaveBeenCalled();
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should return 400 when testCaseId is not a positive integer', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: 'Tag', color: '#ff0000', testCaseId: 0 },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toMatch(/positive integer/i);
			expect(mockDb.query.tag.findFirst).not.toHaveBeenCalled();
		});

		it('should reject assignment when test case is outside the project', async () => {
			mockRequireTestCase.mockRejectedValue(
				Object.assign(new Error(), { status: 404, body: { message: 'Test case not found' } })
			);

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: 'Tag', color: '#ff0000', testCaseId: 999 },
				user: testUser
			});

			await expect(POST(event)).rejects.toThrow();
			expect(mockDb.query.tag.findFirst).not.toHaveBeenCalled();
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should return 409 for duplicate tag name without testCaseId', async () => {
			mockDb.query.tag.findFirst.mockResolvedValue({ id: 1, name: 'Bug', color: '#ff0000' });

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: 'Bug', color: '#ff0000' },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(409);
			expect(data.error).toMatch(/already exists/i);
		});

		it('should assign existing tag to test case when duplicate name with testCaseId', async () => {
			const existingTag = { id: 1, name: 'Bug', color: '#ff0000' };
			mockDb.query.tag.findFirst.mockResolvedValue(existingTag);
			mockDb.query.testCaseTag.findFirst.mockResolvedValue(null);
			mockInsertReturning(mockDb, [{ testCaseId: 10, tagId: 1 }]);

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: 'Bug', color: '#ff0000', testCaseId: 10 },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.tag.id).toBe(1);
			expect(data.assigned).toBe(true);
		});

		it('should return 500 when existing tag assignment insert returns no assignment', async () => {
			const existingTag = { id: 1, name: 'Bug', color: '#ff0000' };
			mockDb.query.tag.findFirst.mockResolvedValue(existingTag);
			mockDb.query.testCaseTag.findFirst.mockResolvedValue(null);
			mockInsertReturning(mockDb, []);

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: 'Bug', color: '#ff0000', testCaseId: 10 },
				user: testUser
			});

			await expect(POST(event)).rejects.toMatchObject({ status: 500 });
		});

		it('should not duplicate assignment when tag already assigned to test case', async () => {
			const existingTag = { id: 1, name: 'Bug', color: '#ff0000' };
			mockDb.query.tag.findFirst.mockResolvedValue(existingTag);
			mockDb.query.testCaseTag.findFirst.mockResolvedValue({ testCaseId: 10, tagId: 1 });

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: 'Bug', color: '#ff0000', testCaseId: 10 },
				user: testUser
			});
			const response = await POST(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.assigned).toBe(true);
			// insert should NOT be called for testCaseTag since already assigned
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should return 401 for unauthenticated request', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: 'Tag', color: '#ff0000' },
				user: null
			});

			await expect(POST(event)).rejects.toThrow();
		});

		it('should trim whitespace from tag name', async () => {
			const created = { id: 3, name: 'Trimmed', color: '#0000ff' };
			mockInsertReturning(mockDb, [created]);

			const event = createMockEvent({
				method: 'POST',
				params: { projectId: '1' },
				body: { name: '  Trimmed  ', color: '#0000ff' },
				user: testUser
			});
			const response = await POST(event);

			expect(response.status).toBe(200);
			// The tag name should be trimmed before validation
			const data = await response.json();
			expect(data.tag.name).toBe('Trimmed');
		});
	});
});
