import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testCaseGroup: {
		id: 'id',
		name: 'name',
		projectId: 'project_id',
		sortOrder: 'sort_order',
		color: 'color',
		createdBy: 'created_by'
	}
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b])
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});

const { PATCH, DELETE } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1', groupId: '20' };

const sampleGroup = {
	id: 20,
	projectId: 1,
	name: 'Smoke Tests',
	color: '#ff0000',
	sortOrder: 1000,
	createdBy: 'user-1'
};

describe('/api/projects/[projectId]/test-case-groups/[groupId] — PATCH & DELETE', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
		mockDb.query.testCaseGroup = { findFirst: vi.fn() };
	});

	describe('PATCH', () => {
		it('should update group name', async () => {
			const updatedGroup = { ...sampleGroup, name: 'Regression Tests' };
			// First call: fetch group; second call (uniqueness check): no conflict; third call: re-fetch after update
			mockDb.query.testCaseGroup.findFirst
				.mockResolvedValueOnce(sampleGroup)
				.mockResolvedValueOnce(null)
				.mockResolvedValueOnce(updatedGroup);

			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'Regression Tests' },
				user: adminUser
			});
			const response = await PATCH(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.name).toBe('Regression Tests');
		});

		it('should update group color', async () => {
			const updatedGroup = { ...sampleGroup, color: '#00ff00' };
			// First call: fetch group; second call: re-fetch after update (no name change = no uniqueness check)
			mockDb.query.testCaseGroup.findFirst
				.mockResolvedValueOnce(sampleGroup)
				.mockResolvedValueOnce(updatedGroup);

			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { color: '#00ff00' },
				user: adminUser
			});
			const response = await PATCH(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.color).toBe('#00ff00');
		});

		it('should validate color format — reject non-hex string', async () => {
			mockDb.query.testCaseGroup.findFirst.mockResolvedValueOnce(sampleGroup);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { color: 'red' },
				user: adminUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(400);
			const body = await response.json();
			expect(body.error).toMatch(/HEX color/i);
		});

		it('should validate color format — reject hex without #', async () => {
			mockDb.query.testCaseGroup.findFirst.mockResolvedValueOnce(sampleGroup);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { color: 'ff0000' },
				user: adminUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(400);
			const body = await response.json();
			expect(body.error).toMatch(/HEX color/i);
		});

		it('should allow null color to clear it', async () => {
			const updatedGroup = { ...sampleGroup, color: null };
			mockDb.query.testCaseGroup.findFirst
				.mockResolvedValueOnce(sampleGroup)
				.mockResolvedValueOnce(updatedGroup);

			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { color: null },
				user: adminUser
			});
			const response = await PATCH(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.color).toBeNull();
		});

		it('should return 400 when name is empty', async () => {
			mockDb.query.testCaseGroup.findFirst.mockResolvedValueOnce(sampleGroup);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: '   ' },
				user: adminUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(400);
			const body = await response.json();
			expect(body.error).toContain('Name cannot be empty');
		});

		it('should return 409 when group name already exists', async () => {
			const conflicting = { ...sampleGroup, id: 999, name: 'Existing Group' };
			mockDb.query.testCaseGroup.findFirst
				.mockResolvedValueOnce(sampleGroup)
				.mockResolvedValueOnce(conflicting);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'Existing Group' },
				user: adminUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(409);
			const body = await response.json();
			expect(body.error).toContain('already exists');
		});

		it('should return 403 for non-admin roles', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'New Name' },
				user: testUser
			});
			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should return 404 when group not found', async () => {
			mockDb.query.testCaseGroup.findFirst.mockResolvedValueOnce(null);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'New Name' },
				user: adminUser
			});
			await expect(PATCH(event)).rejects.toThrow();
		});
	});

	describe('DELETE', () => {
		it('should require PROJECT_ADMIN and delete group', async () => {
			mockDb.query.testCaseGroup.findFirst.mockResolvedValueOnce(sampleGroup);
			const deleteChain = {
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.delete.mockReturnValue(deleteChain as never);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: adminUser
			});
			const response = await DELETE(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);
		});

		it('should return 403 for non-admin', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser
			});
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 404 when group not found', async () => {
			mockDb.query.testCaseGroup.findFirst.mockResolvedValueOnce(null);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: adminUser
			});
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: null
			});
			await expect(DELETE(event)).rejects.toThrow();
		});
	});
});
