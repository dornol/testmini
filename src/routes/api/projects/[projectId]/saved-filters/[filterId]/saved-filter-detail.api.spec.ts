import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockUpdateReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	savedFilter: {
		id: 'id',
		projectId: 'project_id',
		userId: 'user_id',
		name: 'name',
		filters: 'filters'
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

const { PATCH, DELETE } = await import('./+server');

const PARAMS = { projectId: '1', filterId: '10' };

const sampleFilter = {
	id: 10,
	projectId: 1,
	userId: 'user-1',
	name: 'My Filter',
	filters: { status: ['ACTIVE'] },
	createdAt: new Date('2025-01-01')
};

describe('/api/projects/[projectId]/saved-filters/[filterId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.query.savedFilter = { findFirst: vi.fn() };
	});

	describe('PATCH', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'PATCH', params: PARAMS, user: null, body: {} });
			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should return 404 when filter not found or not owned', async () => {
			mockDb.query.savedFilter.findFirst.mockResolvedValue(undefined);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { name: 'Updated' }
			});

			const response = await PATCH(event);
			expect(response.status).toBe(404);
			expect((await response.json()).error).toContain('not found');
		});

		it('should return 400 when request body is not an object', async () => {
			for (const body of [null, ['Filter']]) {
				vi.clearAllMocks();
				mockDb.query.savedFilter = { findFirst: vi.fn().mockResolvedValue(sampleFilter) };

				const event = createMockEvent({
					method: 'PATCH',
					params: PARAMS,
					user: testUser,
					body
				});

				const response = await PATCH(event);
				const data = await response.json();

				expect(response.status).toBe(400);
				expect(data.error).toMatch(/request body/i);
				expect(mockDb.update).not.toHaveBeenCalled();
			}
		});

		it('should reject empty name', async () => {
			mockDb.query.savedFilter.findFirst.mockResolvedValue(sampleFilter);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { name: '   ' }
			});

			const response = await PATCH(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('empty');
		});

		it('should reject name longer than 100 characters', async () => {
			mockDb.query.savedFilter.findFirst.mockResolvedValue(sampleFilter);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { name: 'a'.repeat(101) }
			});

			const response = await PATCH(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('100 characters');
		});

		it('should reject non-string name', async () => {
			mockDb.query.savedFilter.findFirst.mockResolvedValue(sampleFilter);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { name: 123 }
			});

			const response = await PATCH(event);
			expect(response.status).toBe(400);
		});

		it('should reject when no fields to update', async () => {
			mockDb.query.savedFilter.findFirst.mockResolvedValue(sampleFilter);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: {}
			});

			const response = await PATCH(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('No fields');
		});

		it('should reject invalid filters value', async () => {
			mockDb.query.savedFilter.findFirst.mockResolvedValue(sampleFilter);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { filters: null }
			});

			const response = await PATCH(event);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain('object');
		});

		it('should reject array filters value', async () => {
			mockDb.query.savedFilter.findFirst.mockResolvedValue(sampleFilter);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { filters: [] }
			});

			const response = await PATCH(event);
			expect(response.status).toBe(400);
		});

		it('should reject filters with unsafe keys', async () => {
			const unsafeFilters = [
				JSON.parse('{"__proto__":"polluted"}') as Record<string, unknown>,
				{ nested: JSON.parse('{"constructor":"polluted"}') },
				{ nested: [JSON.parse('{"prototype":"polluted"}')] }
			];

			for (const filters of unsafeFilters) {
				vi.clearAllMocks();
				mockDb.query.savedFilter = { findFirst: vi.fn().mockResolvedValue(sampleFilter) };

				const event = createMockEvent({
					method: 'PATCH',
					params: PARAMS,
					user: testUser,
					body: { filters }
				});

				const response = await PATCH(event);
				const data = await response.json();

				expect(response.status).toBe(400);
				expect(data.error).toMatch(/unsafe key/i);
				expect(mockDb.update).not.toHaveBeenCalled();
			}
		});

		it('should reject oversized filters value', async () => {
			mockDb.query.savedFilter.findFirst.mockResolvedValue(sampleFilter);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { filters: { query: 'x'.repeat(20_001) } }
			});

			const response = await PATCH(event);
			expect(response.status).toBe(400);
		});

		it('should update filter name successfully', async () => {
			mockDb.query.savedFilter.findFirst.mockResolvedValue(sampleFilter);
			const updatedFilter = { ...sampleFilter, name: 'Renamed Filter' };
			const updateChain = mockUpdateReturning(mockDb, [updatedFilter]);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { name: 'Renamed Filter' }
			});

			const response = await PATCH(event);
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.name).toBe('Renamed Filter');
			expect(updateChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 10],
					['project_id', 1],
					['user_id', testUser.id]
				])
			);
		});

		it('should update filters object successfully', async () => {
			mockDb.query.savedFilter.findFirst.mockResolvedValue(sampleFilter);
			const newFilters = { status: ['CLOSED'], priority: ['HIGH'] };
			const updatedFilter = { ...sampleFilter, filters: newFilters };
			mockUpdateReturning(mockDb, [updatedFilter]);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { filters: newFilters }
			});

			const response = await PATCH(event);
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.filters).toEqual(newFilters);
		});
	});

	describe('DELETE', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: null });
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 404 when filter not found or not owned', async () => {
			mockDb.query.savedFilter.findFirst.mockResolvedValue(undefined);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser
			});

			const response = await DELETE(event);
			expect(response.status).toBe(404);
			expect((await response.json()).error).toContain('not found');
		});

		it('should delete filter successfully', async () => {
			mockDb.query.savedFilter.findFirst.mockResolvedValue(sampleFilter);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser
			});

			const response = await DELETE(event);
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.success).toBe(true);
			expect(mockDb.delete).toHaveBeenCalled();
			const deleteChain = mockDb.delete.mock.results[0]?.value as {
				where: ReturnType<typeof vi.fn>;
			};
			expect(deleteChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 10],
					['project_id', 1],
					['user_id', testUser.id]
				])
			);
		});
	});
});
