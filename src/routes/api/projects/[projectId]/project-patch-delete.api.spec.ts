import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockUpdateReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser, sampleProject } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	project: { id: 'id', name: 'name', description: 'description', active: 'active', createdBy: 'created_by', createdAt: 'created_at' },
	projectMember: { projectId: 'project_id', userId: 'user_id', role: 'role' }
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	count: vi.fn(() => 'count'),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({
			as: () => ({ sql: strings, values })
		}),
		{ raw: (s: string) => s }
	)
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' }),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});

const { PATCH, DELETE } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1' };

describe('/api/projects/[projectId] — PATCH & DELETE', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectAccess).mockResolvedValue({ role: 'PROJECT_ADMIN' });
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
	});

	describe('PATCH', () => {
		it('should update project name', async () => {
			const updated = { ...sampleProject, name: 'Renamed Project' };
			mockUpdateReturning(mockDb, [updated]);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'Renamed Project' },
				user: adminUser
			});
			const response = await PATCH(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.data.name).toBe('Renamed Project');
		});

		it('should return 403 for non-PROJECT_ADMIN', async () => {
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

		it('should return 400 for invalid data (empty name)', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: '' },
				user: adminUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(400);
		});

		it('should return 400 for invalid projectId', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: { projectId: 'not-a-number' },
				body: { name: 'Valid Name' },
				user: adminUser
			});
			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should return 404 when project not found after update', async () => {
			mockUpdateReturning(mockDb, []);

			const event = createMockEvent({
				method: 'PATCH',
				params: { projectId: '999' },
				body: { name: 'Valid Name' },
				user: adminUser
			});
			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should update project with description', async () => {
			const updated = { ...sampleProject, name: 'Updated', description: 'New description' };
			mockUpdateReturning(mockDb, [updated]);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				body: { name: 'Updated', description: 'New description' },
				user: adminUser
			});
			const response = await PATCH(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.data.description).toBe('New description');
		});
	});

	describe('DELETE', () => {
		it('should deactivate project for PROJECT_ADMIN', async () => {
			const deactivated = { ...sampleProject, active: false };
			mockUpdateReturning(mockDb, [deactivated]);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: adminUser
			});
			const response = await DELETE(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.data.active).toBe(false);
		});

		it('should return 403 for non-PROJECT_ADMIN', async () => {
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

		it('should return 404 when project not found', async () => {
			mockUpdateReturning(mockDb, []);

			const event = createMockEvent({
				method: 'DELETE',
				params: { projectId: '999' },
				user: adminUser
			});
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 400 for invalid projectId', async () => {
			const event = createMockEvent({
				method: 'DELETE',
				params: { projectId: 'abc' },
				user: adminUser
			});
			await expect(DELETE(event)).rejects.toThrow();
		});
	});
});
