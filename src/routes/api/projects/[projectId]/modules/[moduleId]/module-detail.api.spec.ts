import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockUpdateReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	module: {
		id: 'id', projectId: 'project_id', name: 'name',
		parentModuleId: 'parent_module_id', description: 'description', sortOrder: 'sort_order'
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
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' }),
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});

const { PUT, DELETE } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1', moduleId: '3' };

describe('/api/projects/[projectId]/modules/[moduleId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
	});

	describe('PUT', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'PUT', params: PARAMS, body: { name: 'Updated' }, user: null
			});
			await expect(PUT(event)).rejects.toThrow();
		});

		it('should return 400 for invalid module ID', async () => {
			const event = createMockEvent({
				method: 'PUT', params: { projectId: '1', moduleId: 'abc' },
				body: { name: 'Updated' }, user: testUser
			});
			const response = await PUT(event);
			expect(response.status).toBe(400);
		});

		it('should return 400 for invalid input (empty name)', async () => {
			const event = createMockEvent({
				method: 'PUT', params: PARAMS, body: { name: '' }, user: testUser
			});
			const response = await PUT(event);
			expect(response.status).toBe(400);
		});

		it('should return 400 when no fields to update', async () => {
			const event = createMockEvent({
				method: 'PUT', params: PARAMS, body: {}, user: testUser
			});
			const response = await PUT(event);
			expect(response.status).toBe(400);
		});

		it('should return 404 when module not found', async () => {
			mockUpdateReturning(mockDb, []);
			const event = createMockEvent({
				method: 'PUT', params: PARAMS, body: { name: 'New Name' }, user: testUser
			});
			const response = await PUT(event);
			expect(response.status).toBe(404);
		});

		it('should update module on success', async () => {
			const updated = { id: 3, name: 'New Name', projectId: 1, parentModuleId: null };
			mockUpdateReturning(mockDb, [updated]);
			const event = createMockEvent({
				method: 'PUT', params: PARAMS, body: { name: 'New Name' }, user: testUser
			});
			const response = await PUT(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.name).toBe('New Name');
		});

		it('should update description and sortOrder', async () => {
			const updated = { id: 3, name: 'Auth', description: 'Auth module', sortOrder: 5 };
			mockUpdateReturning(mockDb, [updated]);
			const event = createMockEvent({
				method: 'PUT', params: PARAMS,
				body: { description: 'Auth module', sortOrder: 5 },
				user: testUser
			});
			const response = await PUT(event);
			expect(response.status).toBe(200);
		});
	});

	describe('DELETE', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: null });
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 400 for invalid module ID', async () => {
			const event = createMockEvent({
				method: 'DELETE', params: { projectId: '1', moduleId: 'abc' }, user: adminUser
			});
			const response = await DELETE(event);
			expect(response.status).toBe(400);
		});

		it('should return 404 when module not found', async () => {
			const deleteChain = {
				where: vi.fn().mockReturnThis(),
				returning: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve([]).then(r)
			};
			mockDb.delete.mockReturnValue(deleteChain as never);

			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: adminUser });
			const response = await DELETE(event);
			expect(response.status).toBe(404);
		});

		it('should delete module on success', async () => {
			const deleteChain = {
				where: vi.fn().mockReturnThis(),
				returning: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve([{ id: 3 }]).then(r)
			};
			mockDb.delete.mockReturnValue(deleteChain as never);

			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: adminUser });
			const response = await DELETE(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
		});
	});
});
