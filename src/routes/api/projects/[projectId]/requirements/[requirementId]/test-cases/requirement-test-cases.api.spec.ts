import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	requirement: {
		id: 'id',
		projectId: 'project_id'
	},
	requirementTestCase: {
		requirementId: 'requirement_id',
		testCaseId: 'test_case_id'
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
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' }),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' }),
		parseJsonBody: vi.fn().mockImplementation((req: Request) => req.json())
	};
});

const { POST, DELETE } = await import('./+server');

const PARAMS = { projectId: '1', requirementId: '10' };

const sampleRequirement = {
	id: 10,
	projectId: 1,
	title: 'User must be able to login',
	externalId: 'REQ-001',
	description: 'Login functionality',
	source: 'PRD v1.0'
};

describe('/api/projects/[projectId]/requirements/[requirementId]/test-cases', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.query.requirement = { findFirst: vi.fn() };
	});

	describe('POST (link test cases)', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: null,
				body: { testCaseIds: [1] }
			});
			await expect(POST(event)).rejects.toThrow();
		});

		it('should return 404 when requirement not found', async () => {
			mockDb.query.requirement.findFirst.mockResolvedValue(null);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { testCaseIds: [1] }
			});

			await expect(POST(event)).rejects.toThrow();
		});

		it('should return 400 when testCaseIds is missing', async () => {
			mockDb.query.requirement.findFirst.mockResolvedValue(sampleRequirement);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: {}
			});

			const response = await POST(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('testCaseIds');
		});

		it('should return 400 when testCaseIds is empty array', async () => {
			mockDb.query.requirement.findFirst.mockResolvedValue(sampleRequirement);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { testCaseIds: [] }
			});

			const response = await POST(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('testCaseIds');
		});

		it('should return 400 when testCaseIds is not an array', async () => {
			mockDb.query.requirement.findFirst.mockResolvedValue(sampleRequirement);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { testCaseIds: 'not-array' }
			});

			const response = await POST(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('testCaseIds');
		});

		it('should link test cases and return 201', async () => {
			mockDb.query.requirement.findFirst.mockResolvedValue(sampleRequirement);
			mockInsertReturning(mockDb, []);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { testCaseIds: [1, 2, 3] }
			});

			const response = await POST(event);
			expect(response.status).toBe(201);
			const body = await response.json();
			expect(body.linked).toBe(3);
		});

		it('should link a single test case', async () => {
			mockDb.query.requirement.findFirst.mockResolvedValue(sampleRequirement);
			mockInsertReturning(mockDb, []);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { testCaseIds: [42] }
			});

			const response = await POST(event);
			expect(response.status).toBe(201);
			const body = await response.json();
			expect(body.linked).toBe(1);
		});
	});

	describe('DELETE (unlink test case)', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: null,
				searchParams: { testCaseId: '1' }
			});
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 404 when requirement not found', async () => {
			mockDb.query.requirement.findFirst.mockResolvedValue(null);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser,
				searchParams: { testCaseId: '1' }
			});

			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 400 when testCaseId is not a valid number', async () => {
			mockDb.query.requirement.findFirst.mockResolvedValue(sampleRequirement);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser,
				searchParams: { testCaseId: 'not-a-number' }
			});

			const response = await DELETE(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('testCaseId');
		});

		it('should return 400 when testCaseId is not a number', async () => {
			mockDb.query.requirement.findFirst.mockResolvedValue(sampleRequirement);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser,
				searchParams: { testCaseId: 'abc' }
			});

			const response = await DELETE(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('testCaseId');
		});

		it('should unlink test case and return success', async () => {
			mockDb.query.requirement.findFirst.mockResolvedValue(sampleRequirement);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser,
				searchParams: { testCaseId: '5' }
			});

			const response = await DELETE(event);
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.success).toBe(true);
			expect(mockDb.delete).toHaveBeenCalled();
		});
	});
});
