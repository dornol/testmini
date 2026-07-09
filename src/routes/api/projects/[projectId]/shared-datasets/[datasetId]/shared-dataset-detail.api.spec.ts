import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	createMockDb,
	mockDeleteReturning,
	mockUpdateReturning
} from '$lib/server/test-helpers/mock-db';
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
			const updateChain = mockUpdateReturning(mockDb, [{ id: 10 }]);

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

		it('should return 404 when dataset disappears before update', async () => {
			(
				mockDb.query.sharedDataSet as { findFirst: ReturnType<typeof vi.fn> }
			).findFirst.mockResolvedValue({
				id: 10,
				name: 'Old Name',
				projectId: 1
			});
			mockUpdateReturning(mockDb, []);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'Updated Name' },
				user: testUser
			});

			const response = await PATCH(event);
			expect(response.status).toBe(404);
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
			expect((await response.json()).error).toContain('No fields to update');
			expect(
				(mockDb.query.sharedDataSet as { findFirst: ReturnType<typeof vi.fn> }).findFirst
			).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should return 400 when body is not an object', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: null,
				user: testUser
			});

			const response = await PATCH(event);

			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Invalid request body');
			expect(
				(mockDb.query.sharedDataSet as { findFirst: ReturnType<typeof vi.fn> }).findFirst
			).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should return 400 when body has unknown fields', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'Updated', owner: 'qa' },
				user: testUser
			});

			const response = await PATCH(event);

			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('Invalid shared data set field');
			expect(
				(mockDb.query.sharedDataSet as { findFirst: ReturnType<typeof vi.fn> }).findFirst
			).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
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

		it('should return 400 when updated name contains control characters before updating', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'Login\u0000Data' },
				user: testUser
			});

			const response = await PATCH(event);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toBe('Name must not contain control characters');
			expect(
				(mockDb.query.sharedDataSet as { findFirst: ReturnType<typeof vi.fn> }).findFirst
			).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
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

				const event = createMockEvent({
					method: 'PATCH',
					params: PARAMS,
					body: { parameters: [parameter] },
					user: testUser
				});

				const response = await PATCH(event);

				expect(response.status).toBe(400);
				expect((await response.json()).error).toContain('unsafe name');
				expect(
					(mockDb.query.sharedDataSet as { findFirst: ReturnType<typeof vi.fn> }).findFirst
				).not.toHaveBeenCalled();
				expect(mockDb.update).not.toHaveBeenCalled();
			}
		});

		it('should return 400 when updated parameters contain control characters before updating', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { parameters: ['user', 'pass\u0000word'] },
				user: testUser
			});

			const response = await PATCH(event);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toBe('Parameters must not contain control characters');
			expect(
				(mockDb.query.sharedDataSet as { findFirst: ReturnType<typeof vi.fn> }).findFirst
			).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should return 400 before lookup when updated rows do not match updated parameters', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { parameters: ['user'], rows: [{ password: 'secret' }] },
				user: testUser
			});

			const response = await PATCH(event);

			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('unknown parameter');
			expect(
				(mockDb.query.sharedDataSet as { findFirst: ReturnType<typeof vi.fn> }).findFirst
			).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
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
			const deleteChain = mockDeleteReturning(mockDb, [{ id: 10 }]);

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

		it('should return 404 when dataset disappears before delete', async () => {
			(
				mockDb.query.sharedDataSet as { findFirst: ReturnType<typeof vi.fn> }
			).findFirst.mockResolvedValue({
				id: 10,
				name: 'DS',
				projectId: 1
			});
			mockDeleteReturning(mockDb, []);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser
			});

			const response = await DELETE(event);
			expect(response.status).toBe(404);
		});
	});
});
