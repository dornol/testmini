import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testCaseTemplate: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		description: 'description',
		precondition: 'precondition',
		steps: 'steps',
		priority: 'priority',
		createdBy: 'created_by',
		createdAt: 'created_at',
		updatedAt: 'updated_at'
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
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' }),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});

const { GET, PATCH, DELETE } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1', templateId: '1' };

const sampleTemplate = {
	id: 1,
	projectId: 1,
	name: 'Login Template',
	description: 'Template for login tests',
	precondition: 'User exists',
	steps: [{ order: 1, action: 'Enter credentials', expected: 'Login success' }],
	priority: 'MEDIUM',
	createdBy: testUser.id,
	createdAt: new Date('2025-01-01'),
	updatedAt: new Date('2025-01-01')
};

describe('/api/projects/[projectId]/templates/[templateId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectAccess).mockResolvedValue({ role: 'PROJECT_ADMIN' });
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
		mockDb.query.testCaseTemplate = { findFirst: vi.fn().mockResolvedValue(sampleTemplate) };
	});

	describe('GET', () => {
		it('should return template when found', async () => {
			const event = createMockEvent({ params: PARAMS, user: testUser });
			const response = await GET(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.id).toBe(sampleTemplate.id);
			expect(body.name).toBe(sampleTemplate.name);
		});

		it('should return 404 when template not found', async () => {
			mockDb.query.testCaseTemplate.findFirst.mockResolvedValue(null);

			const event = createMockEvent({ params: PARAMS, user: testUser });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ params: PARAMS, user: null });
			await expect(GET(event)).rejects.toThrow();
		});
	});

	describe('PATCH', () => {
		it('should update template fields', async () => {
			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'Updated Template', priority: 'HIGH' },
				user: testUser
			});
			const response = await PATCH(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);
		});

		it('should return 200 with success when no fields provided', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: {},
				user: testUser
			});
			const response = await PATCH(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);
		});

		it('should return 400 when name is empty string', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: '' },
				user: testUser
			});
			const response = await PATCH(event);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toMatch(/name/i);
		});

		it('should accept custom priority values', async () => {
			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { priority: 'URGENT' },
				user: testUser
			});
			const response = await PATCH(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);
		});

		it('should return 403 when lacking required role', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'Updated Template' },
				user: testUser
			});
			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should return 404 when template not found', async () => {
			mockDb.query.testCaseTemplate.findFirst.mockResolvedValue(null);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'Updated Template' },
				user: testUser
			});
			await expect(PATCH(event)).rejects.toThrow();
		});
	});

	describe('DELETE', () => {
		it('should delete template when PROJECT_ADMIN', async () => {
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

		it('should require PROJECT_ADMIN role', async () => {
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

		it('should return 403 for non-admin roles', async () => {
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

		it('should return 404 when template not found', async () => {
			mockDb.query.testCaseTemplate.findFirst.mockResolvedValue(null);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: adminUser
			});
			await expect(DELETE(event)).rejects.toThrow();
		});
	});
});
