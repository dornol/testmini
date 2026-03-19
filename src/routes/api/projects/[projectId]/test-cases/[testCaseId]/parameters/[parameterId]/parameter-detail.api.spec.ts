import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockRequireTestCase = vi.fn().mockResolvedValue({ id: 10, projectId: 1 });

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testCaseParameter: {
		id: 'id', testCaseId: 'test_case_id', name: 'name', orderIndex: 'order_index'
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

const PARAMS = { projectId: '1', testCaseId: '10', parameterId: '20' };

const sampleParam = { id: 20, testCaseId: 10, name: 'browser', orderIndex: 0 };

describe('/api/projects/[projectId]/test-cases/[testCaseId]/parameters/[parameterId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireTestCase.mockResolvedValue({ id: 10, projectId: 1 });
		mockDb.query.testCaseParameter = { findFirst: vi.fn() };
	});

	describe('PATCH', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'PATCH', params: PARAMS, body: { name: 'updated' }, user: null
			});
			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should return 404 when parameter not found', async () => {
			(mockDb.query.testCaseParameter.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
			const event = createMockEvent({
				method: 'PATCH', params: PARAMS, body: { name: 'updated' }, user: testUser
			});
			const response = await PATCH(event);
			expect(response.status).toBe(404);
		});

		it('should return 400 when name is empty', async () => {
			(mockDb.query.testCaseParameter.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleParam);
			const event = createMockEvent({
				method: 'PATCH', params: PARAMS, body: { name: '  ' }, user: testUser
			});
			const response = await PATCH(event);
			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toContain('cannot be empty');
		});

		it('should return 400 when duplicate name exists', async () => {
			let findCallCount = 0;
			(mockDb.query.testCaseParameter.findFirst as ReturnType<typeof vi.fn>).mockImplementation(() => {
				findCallCount++;
				if (findCallCount === 1) return Promise.resolve(sampleParam);
				// Second call: duplicate check -- return a different param with the same name
				return Promise.resolve({ id: 99, testCaseId: 10, name: 'os', orderIndex: 1 });
			});

			const event = createMockEvent({
				method: 'PATCH', params: PARAMS, body: { name: 'os' }, user: testUser
			});
			const response = await PATCH(event);
			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toContain('already exists');
		});

		it('should update parameter name on success', async () => {
			let findCallCount = 0;
			(mockDb.query.testCaseParameter.findFirst as ReturnType<typeof vi.fn>).mockImplementation(() => {
				findCallCount++;
				if (findCallCount === 1) return Promise.resolve(sampleParam);
				// No duplicate found
				return Promise.resolve(null);
			});

			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createMockEvent({
				method: 'PATCH', params: PARAMS, body: { name: 'device' }, user: testUser
			});
			const response = await PATCH(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
		});

		it('should update orderIndex without name check', async () => {
			(mockDb.query.testCaseParameter.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleParam);

			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createMockEvent({
				method: 'PATCH', params: PARAMS, body: { orderIndex: 5 }, user: testUser
			});
			const response = await PATCH(event);
			expect(response.status).toBe(200);
		});

		it('should return success even with no updates', async () => {
			(mockDb.query.testCaseParameter.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleParam);

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

		it('should return 404 when parameter not found', async () => {
			(mockDb.query.testCaseParameter.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: testUser });
			const response = await DELETE(event);
			expect(response.status).toBe(404);
		});

		it('should delete parameter on success', async () => {
			(mockDb.query.testCaseParameter.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(sampleParam);

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
