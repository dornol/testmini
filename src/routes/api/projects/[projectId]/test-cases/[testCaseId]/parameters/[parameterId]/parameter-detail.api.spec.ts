import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	createMockDb,
	mockDeleteReturning,
	mockUpdateReturning
} from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockRequireTestCase = vi.fn().mockResolvedValue({ id: 10, projectId: 1 });

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	testCaseParameter: {
		id: 'id',
		testCaseId: 'test_case_id',
		name: 'name',
		orderIndex: 'order_index'
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
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' }),
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});
vi.mock('$lib/server/queries', () => ({
	requireTestCase: mockRequireTestCase
}));

const { PATCH, DELETE } = await import('./+server');

const PARAMS = { projectId: '1', testCaseId: '10', parameterId: '20' };

const sampleParam = { id: 20, testCaseId: 10, name: 'browser', orderIndex: 0 };

describe('/api/projects/[projectId]/test-cases/[testCaseId]/parameters/[parameterId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireTestCase.mockResolvedValue({ id: 10, projectId: 1 });
		mockDb.query.testCaseParameter = { findFirst: vi.fn() };
		mockUpdateReturning(mockDb, [{ id: sampleParam.id }]);
		mockDeleteReturning(mockDb, [{ id: sampleParam.id }]);
	});

	describe('PATCH', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'updated' },
				user: null
			});
			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should return 404 when parameter not found', async () => {
			(mockDb.query.testCaseParameter.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
				null
			);
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'updated' },
				user: testUser
			});
			const response = await PATCH(event);
			expect(response.status).toBe(404);
		});

		it('should return 400 when name is empty', async () => {
			(mockDb.query.testCaseParameter.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
				sampleParam
			);
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: '  ' },
				user: testUser
			});
			const response = await PATCH(event);
			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toContain('cannot be empty');
		});

		it('should return 400 when request body is not an object', async () => {
			(mockDb.query.testCaseParameter.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
				sampleParam
			);
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: ['updated'],
				user: testUser
			});
			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toMatch(/request body/i);
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should return 400 when name is too long', async () => {
			(mockDb.query.testCaseParameter.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
				sampleParam
			);
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'x'.repeat(201) },
				user: testUser
			});
			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toMatch(/200 characters/i);
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should return 400 when name contains control characters before lookup', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'user\u0000name' },
				user: testUser
			});
			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toBe('Parameter name must not contain control characters');
			expect(mockDb.query.testCaseParameter.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should return 400 when orderIndex is invalid', async () => {
			const cases = ['1', 'abc', null, true, {}, -1, 1.5, Number.MAX_SAFE_INTEGER + 1];

			for (const orderIndex of cases) {
				vi.clearAllMocks();
				mockRequireTestCase.mockResolvedValue({ id: 10, projectId: 1 });
				mockDb.query.testCaseParameter = { findFirst: vi.fn().mockResolvedValue(sampleParam) };

				const event = createMockEvent({
					method: 'PATCH',
					params: PARAMS,
					body: { orderIndex },
					user: testUser
				});
				const response = await PATCH(event);
				const data = await response.json();

				expect(response.status).toBe(400);
				expect(data.error).toMatch(/non-negative integer/i);
				expect(mockDb.update).not.toHaveBeenCalled();
			}
		});

		it('should return 400 when orderIndex is blank', async () => {
			(mockDb.query.testCaseParameter.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
				sampleParam
			);
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { orderIndex: '' },
				user: testUser
			});
			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toMatch(/non-negative integer/i);
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should return 400 when duplicate name exists', async () => {
			let findCallCount = 0;
			(mockDb.query.testCaseParameter.findFirst as ReturnType<typeof vi.fn>).mockImplementation(
				() => {
					findCallCount++;
					if (findCallCount === 1) return Promise.resolve(sampleParam);
					// Second call: duplicate check -- return a different param with the same name
					return Promise.resolve({ id: 99, testCaseId: 10, name: 'os', orderIndex: 1 });
				}
			);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'os' },
				user: testUser
			});
			const response = await PATCH(event);
			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toContain('already exists');
		});

		it('should update parameter name on success', async () => {
			let findCallCount = 0;
			(mockDb.query.testCaseParameter.findFirst as ReturnType<typeof vi.fn>).mockImplementation(
				() => {
					findCallCount++;
					if (findCallCount === 1) return Promise.resolve(sampleParam);
					// No duplicate found
					return Promise.resolve(null);
				}
			);

			const updateChain = mockUpdateReturning(mockDb, [{ id: sampleParam.id }]);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'device' },
				user: testUser
			});
			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(updateChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 20],
					['test_case_id', 10],
					expect.objectContaining({ values: [10, 1] })
				])
			);
		});

		it('should update orderIndex without name check', async () => {
			(mockDb.query.testCaseParameter.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
				sampleParam
			);

			mockUpdateReturning(mockDb, [{ id: sampleParam.id }]);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { orderIndex: 5 },
				user: testUser
			});
			const response = await PATCH(event);
			expect(response.status).toBe(200);
		});

		it('should return 404 when parameter disappears before update', async () => {
			(mockDb.query.testCaseParameter.findFirst as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce(sampleParam)
				.mockResolvedValueOnce(null);
			mockUpdateReturning(mockDb, []);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'device' },
				user: testUser
			});
			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(404);
			expect(data.error).toContain('Parameter not found');
		});

		it('should return 400 with no updates', async () => {
			(mockDb.query.testCaseParameter.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
				sampleParam
			);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: {},
				user: testUser
			});
			const response = await PATCH(event);
			const data = await response.json();
			expect(response.status).toBe(400);
			expect(data.error).toContain('No fields to update');
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should return 400 for unknown fields before updating', async () => {
			(mockDb.query.testCaseParameter.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
				sampleParam
			);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'device', value: 'chrome' },
				user: testUser
			});
			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain('Invalid parameter field');
			expect(mockDb.update).not.toHaveBeenCalled();
		});
	});

	describe('DELETE', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: null });
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 404 when parameter not found', async () => {
			(mockDb.query.testCaseParameter.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
				null
			);
			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: testUser });
			const response = await DELETE(event);
			expect(response.status).toBe(404);
		});

		it('should delete parameter on success', async () => {
			(mockDb.query.testCaseParameter.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
				sampleParam
			);

			const deleteChain = mockDeleteReturning(mockDb, [{ id: sampleParam.id }]);

			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: testUser });
			const response = await DELETE(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(deleteChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 20],
					['test_case_id', 10],
					expect.objectContaining({ values: [10, 1] })
				])
			);
			expect(deleteChain.returning).toHaveBeenCalledWith({ id: 'id' });
		});

		it('should return 404 when parameter disappears before delete', async () => {
			(mockDb.query.testCaseParameter.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
				sampleParam
			);
			mockDeleteReturning(mockDb, []);

			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: testUser });
			const response = await DELETE(event);
			const data = await response.json();

			expect(response.status).toBe(404);
			expect(data.error).toContain('Parameter not found');
		});
	});
});
