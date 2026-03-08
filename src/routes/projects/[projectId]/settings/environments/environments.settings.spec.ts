import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	environmentConfig: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		color: 'color',
		position: 'position',
		isDefault: 'is_default',
		createdAt: 'created_at',
		createdBy: 'created_by'
	},
	testRun: {
		id: 'id',
		projectId: 'project_id',
		environment: 'environment'
	}
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	asc: vi.fn((a: unknown) => a)
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});

const { load, actions } = await import('./+page.server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1' };

const sampleEnvironments = [
	{ id: 1, projectId: 1, name: 'Development', color: '#3b82f6', position: 0, isDefault: true, createdBy: 'user-1', createdAt: new Date('2025-01-01') },
	{ id: 2, projectId: 1, name: 'Staging', color: '#f97316', position: 1, isDefault: false, createdBy: 'user-1', createdAt: new Date('2025-01-01') },
	{ id: 3, projectId: 1, name: 'Production', color: '#ef4444', position: 2, isDefault: false, createdBy: 'user-1', createdAt: new Date('2025-01-01') }
];

function makeFormData(entries: Record<string, string>): FormData {
	const fd = new FormData();
	for (const [key, value] of Object.entries(entries)) {
		fd.set(key, value);
	}
	return fd;
}

describe('environments settings page server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
		// Reset query mock
		if (!mockDb.query.environmentConfig) {
			mockDb.query.environmentConfig = { findFirst: vi.fn() };
		}
	});

	describe('load', () => {
		it('should return environments ordered by position', async () => {
			mockSelectResult(mockDb, sampleEnvironments);

			const result = await load({ params: PARAMS } as never);

			expect(result.environments).toEqual(sampleEnvironments);
			expect(mockDb.select).toHaveBeenCalled();
		});

		it('should return empty array when no environments exist', async () => {
			mockSelectResult(mockDb, []);

			const result = await load({ params: PARAMS } as never);

			expect(result.environments).toEqual([]);
		});
	});

	describe('actions.create', () => {
		it('should create an environment successfully', async () => {
			// No duplicate found
			mockDb.query.environmentConfig.findFirst.mockResolvedValue(null);
			// Existing positions
			mockSelectResult(mockDb, [{ position: 0 }, { position: 1 }]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				formData: makeFormData({ name: 'QA', color: '#10b981', isDefault: 'false' }),
				user: testUser
			});

			const result = await actions.create(event);

			expect(result).toEqual({ created: true });
			expect(mockDb.transaction).toHaveBeenCalled();
		});

		it('should reject duplicate environment name', async () => {
			mockDb.query.environmentConfig.findFirst.mockResolvedValue(sampleEnvironments[0]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				formData: makeFormData({ name: 'Development', color: '#3b82f6', isDefault: 'false' }),
				user: testUser
			});

			const result = await actions.create(event);

			expect(result).toBeDefined();
			const data = (result as { status: number; data: Record<string, unknown> }).data;
			expect(data.duplicate).toBe(true);
		});

		it('should reject empty name', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				formData: makeFormData({ name: '', color: '#ff0000', isDefault: 'false' }),
				user: testUser
			});

			const result = await actions.create(event);

			expect(result).toBeDefined();
			const data = (result as { status: number; data: Record<string, unknown> }).data;
			expect(data.errors).toBeDefined();
		});

		it('should auto-calculate position from existing environments', async () => {
			mockDb.query.environmentConfig.findFirst.mockResolvedValue(null);
			// Existing positions: 0, 1, 2 => new should be 3
			mockSelectResult(mockDb, [{ position: 0 }, { position: 1 }, { position: 2 }]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				formData: makeFormData({ name: 'QA', color: '#10b981', isDefault: 'false' }),
				user: testUser
			});

			const result = await actions.create(event);

			expect(result).toEqual({ created: true });
			expect(mockDb.transaction).toHaveBeenCalled();
		});

		it('should set position to 0 when no environments exist', async () => {
			mockDb.query.environmentConfig.findFirst.mockResolvedValue(null);
			mockSelectResult(mockDb, []);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				formData: makeFormData({ name: 'Development', color: '#3b82f6', isDefault: 'false' }),
				user: testUser
			});

			const result = await actions.create(event);

			expect(result).toEqual({ created: true });
			expect(mockDb.transaction).toHaveBeenCalled();
		});

		it('should reject invalid color format', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				formData: makeFormData({ name: 'QA', color: 'invalid', isDefault: 'false' }),
				user: testUser
			});

			const result = await actions.create(event);

			expect(result).toBeDefined();
			const data = (result as { status: number; data: Record<string, unknown> }).data;
			expect(data.errors).toBeDefined();
		});
	});

	describe('actions.update', () => {
		it('should update an environment successfully', async () => {
			// findFirst for existing check
			mockDb.query.environmentConfig.findFirst
				.mockResolvedValueOnce(sampleEnvironments[0]) // existing
				.mockResolvedValueOnce(null); // no duplicate

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				formData: makeFormData({ environmentId: '1', name: 'Dev Updated', color: '#0000ff', isDefault: 'false' }),
				user: testUser
			});

			const result = await actions.update(event);

			expect(result).toEqual({ updated: true });
			expect(mockDb.transaction).toHaveBeenCalled();
		});

		it('should cascade name change to testRun', async () => {
			mockDb.query.environmentConfig.findFirst
				.mockResolvedValueOnce({ ...sampleEnvironments[0], name: 'OldName' }) // existing with old name
				.mockResolvedValueOnce(null); // no duplicate

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				formData: makeFormData({ environmentId: '1', name: 'NewName', color: '#3b82f6', isDefault: 'false' }),
				user: testUser
			});

			const result = await actions.update(event);

			expect(result).toEqual({ updated: true });
			expect(mockDb.transaction).toHaveBeenCalled();
		});

		it('should reject duplicate name on update', async () => {
			mockDb.query.environmentConfig.findFirst
				.mockResolvedValueOnce(sampleEnvironments[0]) // existing (id=1)
				.mockResolvedValueOnce({ ...sampleEnvironments[1], name: 'Staging' }); // duplicate found (id=2)

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				formData: makeFormData({ environmentId: '1', name: 'Staging', color: '#3b82f6', isDefault: 'false' }),
				user: testUser
			});

			const result = await actions.update(event);

			expect(result).toBeDefined();
			const data = (result as { status: number; data: Record<string, unknown> }).data;
			expect(data.duplicate).toBe(true);
		});

		it('should return 404 when environment not found', async () => {
			mockDb.query.environmentConfig.findFirst.mockResolvedValueOnce(null);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				formData: makeFormData({ environmentId: '999', name: 'NotFound', color: '#000000', isDefault: 'false' }),
				user: testUser
			});

			const result = await actions.update(event);

			expect(result).toBeDefined();
			const status = (result as { status: number }).status;
			expect(status).toBe(404);
		});

		it('should return 404 when environment belongs to different project', async () => {
			mockDb.query.environmentConfig.findFirst.mockResolvedValueOnce({
				...sampleEnvironments[0],
				projectId: 999 // different project
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				formData: makeFormData({ environmentId: '1', name: 'Dev', color: '#000000', isDefault: 'false' }),
				user: testUser
			});

			const result = await actions.update(event);

			expect(result).toBeDefined();
			const status = (result as { status: number }).status;
			expect(status).toBe(404);
		});

		it('should reject invalid schema input', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				formData: makeFormData({ environmentId: '1', name: '', color: '#ff0000', isDefault: 'false' }),
				user: testUser
			});

			const result = await actions.update(event);

			expect(result).toBeDefined();
			const data = (result as { status: number; data: Record<string, unknown> }).data;
			expect(data.errors).toBeDefined();
		});
	});

	describe('actions.delete', () => {
		it('should delete an environment successfully', async () => {
			mockDb.query.environmentConfig.findFirst.mockResolvedValue(sampleEnvironments[1]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				formData: makeFormData({ environmentId: '2' }),
				user: testUser
			});

			const result = await actions.delete(event);

			expect(result).toEqual({ deleted: true });
			expect(mockDb.delete).toHaveBeenCalled();
		});

		it('should return 400 when environmentId is missing', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				formData: makeFormData({}),
				user: testUser
			});

			const result = await actions.delete(event);

			expect(result).toBeDefined();
			const status = (result as { status: number }).status;
			expect(status).toBe(400);
		});

		it('should return 404 when environment not found', async () => {
			mockDb.query.environmentConfig.findFirst.mockResolvedValue(null);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				formData: makeFormData({ environmentId: '999' }),
				user: testUser
			});

			const result = await actions.delete(event);

			expect(result).toBeDefined();
			const status = (result as { status: number }).status;
			expect(status).toBe(404);
		});

		it('should return 404 when environment belongs to different project', async () => {
			mockDb.query.environmentConfig.findFirst.mockResolvedValue({
				...sampleEnvironments[0],
				projectId: 999
			});

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				formData: makeFormData({ environmentId: '1' }),
				user: testUser
			});

			const result = await actions.delete(event);

			expect(result).toBeDefined();
			const status = (result as { status: number }).status;
			expect(status).toBe(404);
		});
	});

	describe('actions.reorder', () => {
		it('should reorder environments successfully', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				formData: makeFormData({ order: JSON.stringify([3, 1, 2]) }),
				user: testUser
			});

			const result = await actions.reorder(event);

			expect(result).toEqual({ reordered: true });
			expect(mockDb.transaction).toHaveBeenCalled();
		});

		it('should return 400 for invalid order JSON', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				formData: makeFormData({ order: 'not-json' }),
				user: testUser
			});

			const result = await actions.reorder(event);

			expect(result).toBeDefined();
			const status = (result as { status: number }).status;
			expect(status).toBe(400);
		});
	});
});
