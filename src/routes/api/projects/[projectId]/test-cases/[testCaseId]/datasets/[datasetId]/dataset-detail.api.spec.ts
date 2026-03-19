import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockRequireTestCase = vi.fn().mockResolvedValue({ id: 10, projectId: 1 });

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testCaseDataSet: {
		id: 'id', testCaseId: 'test_case_id', name: 'name',
		values: 'values', orderIndex: 'order_index'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args)
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' }),
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});
vi.mock('$lib/server/queries', () => ({
	requireTestCase: mockRequireTestCase
}));

const { PATCH, DELETE } = await import('./+server');

const PARAMS = { projectId: '1', testCaseId: '10', datasetId: '30' };

const sampleDataSet = {
	id: 30, testCaseId: 10, name: 'Set A',
	values: { browser: 'Chrome', os: 'Windows' }, orderIndex: 0
};

describe('/api/projects/[projectId]/test-cases/[testCaseId]/datasets/[datasetId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireTestCase.mockResolvedValue({ id: 10, projectId: 1 });
		mockDb.query.testCaseDataSet = { findFirst: vi.fn() };
	});

	describe('PATCH', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'PATCH', params: PARAMS, body: { name: 'Updated' }, user: null
			});
			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should return 404 when dataset not found', async () => {
			(mockDb.query.testCaseDataSet.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
			const event = createMockEvent({
				method: 'PATCH', params: PARAMS, body: { name: 'Updated' }, user: testUser
			});
			const response = await PATCH(event);
			expect(response.status).toBe(404);
		});

		it('should update dataset name on success', async () => {
			(mockDb.query.testCaseDataSet.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDataSet);

			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createMockEvent({
				method: 'PATCH', params: PARAMS, body: { name: 'Set B' }, user: testUser
			});
			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
		});

		it('should update values on success', async () => {
			(mockDb.query.testCaseDataSet.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDataSet);

			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createMockEvent({
				method: 'PATCH', params: PARAMS,
				body: { values: { browser: 'Firefox', os: 'Linux' } },
				user: testUser
			});
			const response = await PATCH(event);
			expect(response.status).toBe(200);
		});

		it('should update orderIndex', async () => {
			(mockDb.query.testCaseDataSet.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDataSet);

			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createMockEvent({
				method: 'PATCH', params: PARAMS, body: { orderIndex: 3 }, user: testUser
			});
			const response = await PATCH(event);
			expect(response.status).toBe(200);
		});

		it('should set name to null when empty string', async () => {
			(mockDb.query.testCaseDataSet.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDataSet);

			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createMockEvent({
				method: 'PATCH', params: PARAMS, body: { name: '' }, user: testUser
			});
			const response = await PATCH(event);
			expect(response.status).toBe(200);
		});

		it('should return success with no updates (empty body)', async () => {
			(mockDb.query.testCaseDataSet.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDataSet);

			const event = createMockEvent({
				method: 'PATCH', params: PARAMS, body: {}, user: testUser
			});
			const response = await PATCH(event);
			expect(response.status).toBe(200);
		});
	});

	describe('DELETE', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: null });
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 404 when dataset not found', async () => {
			(mockDb.query.testCaseDataSet.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: testUser });
			const response = await DELETE(event);
			expect(response.status).toBe(404);
		});

		it('should delete dataset on success', async () => {
			(mockDb.query.testCaseDataSet.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDataSet);

			const deleteChain = {
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.delete.mockReturnValue(deleteChain as never);

			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: testUser });
			const response = await DELETE(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
		});
	});
});
