import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
// The detail endpoint uses db.query.testSuite.findFirst
(mockDb.query as Record<string, unknown>).testSuite = { findFirst: vi.fn() };

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testSuite: {
		id: 'id',
		name: 'name',
		description: 'description',
		projectId: 'project_id',
		createdBy: 'created_by',
		createdAt: 'created_at'
	},
	testSuiteItem: { id: 'id', suiteId: 'suite_id', testCaseId: 'test_case_id' },
	testCase: { id: 'id', key: 'key', latestVersionId: 'latest_version_id' },
	testCaseVersion: { id: 'id', title: 'title', priority: 'priority' },
	user: { id: 'id', name: 'name' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args)
}));

vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' }),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});

const { GET, PATCH, DELETE } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1', suiteId: '5' };

const sampleSuite = {
	id: 5,
	projectId: 1,
	name: 'Smoke Tests',
	description: 'Basic smoke test suite',
	createdBy: 'user-1',
	createdAt: new Date('2025-01-01')
};

const sampleItems = [
	{ id: 1, testCaseId: 10, key: 'TC-0001', title: 'Login should work', priority: 'MEDIUM' }
];

describe('/api/projects/[projectId]/test-suites/[suiteId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectAccess).mockResolvedValue({ role: 'QA' });
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
		vi.mocked(
			(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testSuite.findFirst
		).mockResolvedValue(sampleSuite);
	});

	describe('GET', () => {
		it('should return suite detail with items', async () => {
			mockSelectResult(mockDb, sampleItems);

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser
			});
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.id).toBe(5);
			expect(data.name).toBe('Smoke Tests');
			expect(Array.isArray(data.items)).toBe(true);
		});

		it('should return suite detail with empty items', async () => {
			mockSelectResult(mockDb, []);

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser
			});
			const response = await GET(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.items).toEqual([]);
		});

		it('should return 404 when suite not found', async () => {
			vi.mocked(
				(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testSuite.findFirst
			).mockResolvedValue(null);

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser
			});
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return 401 when unauthenticated', async () => {
			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: null
			});
			await expect(GET(event)).rejects.toThrow();
		});
	});

	describe('PATCH', () => {
		it('should update suite name', async () => {
			const updatedSuite = { ...sampleSuite, name: 'Regression Tests' };
			vi.mocked(
				(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testSuite.findFirst
			)
				.mockResolvedValueOnce(sampleSuite)  // initial fetch
				.mockResolvedValueOnce(updatedSuite); // re-fetch after update

			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'Regression Tests' },
				user: testUser
			});
			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.name).toBe('Regression Tests');
		});

		it('should update suite description', async () => {
			const updatedSuite = { ...sampleSuite, description: 'Updated description' };
			vi.mocked(
				(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testSuite.findFirst
			)
				.mockResolvedValueOnce(sampleSuite)
				.mockResolvedValueOnce(updatedSuite);

			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { description: 'Updated description' },
				user: testUser
			});
			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.description).toBe('Updated description');
		});

		it('should return 400 when no fields are provided', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: {},
				user: testUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toBe('No fields to update');
		});

		it('should return 404 when suite not found', async () => {
			vi.mocked(
				(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testSuite.findFirst
			).mockResolvedValue(null);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'New Name' },
				user: testUser
			});
			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should return 403 for non-admin roles', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'New Name' },
				user: testUser
			});
			await expect(PATCH(event)).rejects.toThrow();
		});
	});

	describe('DELETE', () => {
		it('should require PROJECT_ADMIN and delete suite', async () => {
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
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
		});

		it('should return 403 for non-admin', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser
			});
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 404 when suite not found', async () => {
			vi.mocked(
				(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testSuite.findFirst
			).mockResolvedValue(null);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: adminUser
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
	});
});
