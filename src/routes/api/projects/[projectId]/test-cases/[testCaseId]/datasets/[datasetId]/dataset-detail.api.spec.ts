import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockRequireTestCase = vi.fn().mockResolvedValue({ id: 10, projectId: 1 });

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	testCaseDataSet: {
		id: 'id',
		testCaseId: 'test_case_id',
		name: 'name',
		values: 'values',
		orderIndex: 'order_index'
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
	id: 30,
	testCaseId: 10,
	name: 'Set A',
	values: { browser: 'Chrome', os: 'Windows' },
	orderIndex: 0
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
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'Updated' },
				user: null
			});
			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should return 400 when request body is not an object', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: ['Updated'],
				user: testUser
			});

			const response = await PATCH(event);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toMatch(/request body/i);
			expect(mockDb.query.testCaseDataSet.findFirst).not.toHaveBeenCalled();
		});

		it('should return 400 when name is not a string or null', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 123 },
				user: testUser
			});

			const response = await PATCH(event);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toMatch(/name must be a string or null/i);
			expect(mockDb.query.testCaseDataSet.findFirst).not.toHaveBeenCalled();
		});

		it('should return 400 when request body has unknown fields', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'Set B', extra: 'x' },
				user: testUser
			});

			const response = await PATCH(event);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toContain('Invalid data set field');
			expect(mockDb.query.testCaseDataSet.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should return 400 when values contain non-string entries', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { values: { browser: ['Chrome'] } },
				user: testUser
			});

			const response = await PATCH(event);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toMatch(/string values/i);
			expect(mockDb.query.testCaseDataSet.findFirst).not.toHaveBeenCalled();
		});

		it('should return 400 when values contain unsafe keys', async () => {
			const unsafeKeys = ['__proto__', 'constructor', 'prototype'];

			for (const key of unsafeKeys) {
				vi.clearAllMocks();
				mockDb.query.testCaseDataSet = { findFirst: vi.fn() };

				const event = createMockEvent({
					method: 'PATCH',
					params: PARAMS,
					body: { values: { [key]: 'polluted' } },
					user: testUser
				});

				const response = await PATCH(event);
				const body = await response.json();

				expect(response.status).toBe(400);
				expect(body.error).toMatch(/unsafe key/i);
				expect(mockDb.query.testCaseDataSet.findFirst).not.toHaveBeenCalled();
				expect(mockDb.update).not.toHaveBeenCalled();
			}
		});

		it('should return 400 when orderIndex is negative', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { orderIndex: -1 },
				user: testUser
			});

			const response = await PATCH(event);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toMatch(/non-negative integer/i);
			expect(mockDb.query.testCaseDataSet.findFirst).not.toHaveBeenCalled();
		});

		it('should return 404 when dataset not found', async () => {
			(mockDb.query.testCaseDataSet.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'Updated' },
				user: testUser
			});
			const response = await PATCH(event);
			expect(response.status).toBe(404);
		});

		it('should update dataset name on success', async () => {
			(mockDb.query.testCaseDataSet.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
				sampleDataSet
			);

			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'Set B' },
				user: testUser
			});
			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(updateChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 30],
					['test_case_id', 10]
				])
			);
		});

		it('should update values on success', async () => {
			(mockDb.query.testCaseDataSet.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
				sampleDataSet
			);

			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { values: { browser: 'Firefox', os: 'Linux' } },
				user: testUser
			});
			const response = await PATCH(event);
			expect(response.status).toBe(200);
		});

		it('should update orderIndex', async () => {
			(mockDb.query.testCaseDataSet.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
				sampleDataSet
			);

			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { orderIndex: 3 },
				user: testUser
			});
			const response = await PATCH(event);
			expect(response.status).toBe(200);
		});

		it('should set name to null when empty string', async () => {
			(mockDb.query.testCaseDataSet.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
				sampleDataSet
			);

			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: '' },
				user: testUser
			});
			const response = await PATCH(event);
			expect(response.status).toBe(200);
		});

		it('should return 400 when no fields are provided', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: {},
				user: testUser
			});
			const response = await PATCH(event);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toContain('No fields to update');
			expect(mockDb.query.testCaseDataSet.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
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
			(mockDb.query.testCaseDataSet.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
				sampleDataSet
			);

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
			expect(deleteChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 30],
					['test_case_id', 10]
				])
			);
		});
	});
});
