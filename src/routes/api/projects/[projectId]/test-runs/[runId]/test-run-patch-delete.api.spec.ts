import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser, sampleTestRun } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testRun: { id: 'id', projectId: 'project_id', name: 'name', status: 'status', environment: 'environment' }
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

const PARAMS = { projectId: '1', runId: '50' };

describe('/api/projects/[projectId]/test-runs/[runId] — PATCH & DELETE', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
	});

	describe('PATCH', () => {
		it('should update run name', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'Updated Run Name' },
				user: adminUser
			});
			const response = await PATCH(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);
		});

		it('should update environment', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { environment: 'PROD' },
				user: adminUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(200);
		});

		it('should return 403 for VIEWER', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'Updated' },
				user: testUser
			});
			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should return 404 when run not found', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(null);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'Updated' },
				user: adminUser
			});
			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should return 409 when run is not in CREATED status', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue({
				...sampleTestRun,
				status: 'IN_PROGRESS'
			});

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'Updated' },
				user: adminUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(409);
			const body = await response.json();
			expect(body.error).toContain('Only CREATED runs');
		});

		it('should return 400 for empty name', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: '' },
				user: adminUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(400);
		});

		it('should return 400 when no fields provided', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: {},
				user: adminUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(400);
		});
	});

	describe('DELETE', () => {
		it('should require PROJECT_ADMIN and delete run', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
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

		it('should return 404 when run not found', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(null);

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
