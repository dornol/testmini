import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockUpdateReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
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
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>(
		'$lib/server/auth-utils'
	);
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

		it('should update filter name successfully', async () => {
			mockDb.query.savedFilter.findFirst.mockResolvedValue(sampleFilter);
			const updatedFilter = { ...sampleFilter, name: 'Renamed Filter' };
			mockUpdateReturning(mockDb, [updatedFilter]);

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
		});
	});
});
