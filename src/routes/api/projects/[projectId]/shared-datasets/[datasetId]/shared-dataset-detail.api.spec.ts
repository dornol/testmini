import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	sharedDataSet: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		parameters: 'parameters',
		rows: 'rows',
		createdBy: 'created_by'
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
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' }),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});

// Add sharedDataSet to query mock
mockDb.query.sharedDataSet = { findFirst: vi.fn() } as never;

const { PATCH, DELETE } = await import('./+server');

const PARAMS = { projectId: '1', datasetId: '10' };

describe('/api/projects/[projectId]/shared-datasets/[datasetId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
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

		it('should return 404 when dataset not found', async () => {
			(
				mockDb.query.sharedDataSet as { findFirst: ReturnType<typeof vi.fn> }
			).findFirst.mockResolvedValue(null);
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
			(
				mockDb.query.sharedDataSet as { findFirst: ReturnType<typeof vi.fn> }
			).findFirst.mockResolvedValue({
				id: 10,
				name: 'Old Name',
				projectId: 1
			});
			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'Updated Name' },
				user: testUser
			});
			const response = await PATCH(event);
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.success).toBe(true);
			expect(updateChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 10],
					['project_id', 1]
				])
			);
		});

		it('should succeed with no updates when body is empty', async () => {
			(
				mockDb.query.sharedDataSet as { findFirst: ReturnType<typeof vi.fn> }
			).findFirst.mockResolvedValue({
				id: 10,
				name: 'Name',
				projectId: 1
			});

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: {},
				user: testUser
			});
			const response = await PATCH(event);
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.success).toBe(true);
		});

		it('should return 400 when body is not an object', async () => {
			(
				mockDb.query.sharedDataSet as { findFirst: ReturnType<typeof vi.fn> }
			).findFirst.mockResolvedValue({
				id: 10,
				name: 'Name',
				projectId: 1,
				parameters: ['user'],
				rows: []
			});

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: null,
				user: testUser
			});

			const response = await PATCH(event);

			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Invalid request body');
		});

		it('should return 400 when updated name is empty', async () => {
			(
				mockDb.query.sharedDataSet as { findFirst: ReturnType<typeof vi.fn> }
			).findFirst.mockResolvedValue({
				id: 10,
				name: 'Name',
				projectId: 1,
				parameters: ['user'],
				rows: []
			});

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: '   ' },
				user: testUser
			});

			const response = await PATCH(event);

			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Name is required');
		});

		it('should return 400 when updated rows contain unknown parameters', async () => {
			(
				mockDb.query.sharedDataSet as { findFirst: ReturnType<typeof vi.fn> }
			).findFirst.mockResolvedValue({
				id: 10,
				name: 'Name',
				projectId: 1,
				parameters: ['user'],
				rows: []
			});

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { rows: [{ password: 'secret' }] },
				user: testUser
			});

			const response = await PATCH(event);

			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('unknown parameter');
		});

		it('should return 400 when updated parameters contain unsafe names', async () => {
			const unsafeNames = ['__proto__', 'constructor', 'prototype'];

			for (const parameter of unsafeNames) {
				vi.clearAllMocks();
				(
					mockDb.query.sharedDataSet as { findFirst: ReturnType<typeof vi.fn> }
				).findFirst.mockResolvedValue({
					id: 10,
					name: 'Name',
					projectId: 1,
					parameters: ['user'],
					rows: []
				});

				const event = createMockEvent({
					method: 'PATCH',
					params: PARAMS,
					body: { parameters: [parameter] },
					user: testUser
				});

				const response = await PATCH(event);

				expect(response.status).toBe(400);
				expect((await response.json()).error).toContain('unsafe name');
				expect(mockDb.update).not.toHaveBeenCalled();
			}
		});
	});

	describe('DELETE', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: null
			});
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 404 when dataset not found', async () => {
			(
				mockDb.query.sharedDataSet as { findFirst: ReturnType<typeof vi.fn> }
			).findFirst.mockResolvedValue(null);
			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser
			});
			const response = await DELETE(event);
			expect(response.status).toBe(404);
		});

		it('should delete dataset on success', async () => {
			(
				mockDb.query.sharedDataSet as { findFirst: ReturnType<typeof vi.fn> }
			).findFirst.mockResolvedValue({
				id: 10,
				name: 'DS',
				projectId: 1
			});
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
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.success).toBe(true);
			expect(deleteChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 10],
					['project_id', 1]
				])
			);
		});
	});
});
