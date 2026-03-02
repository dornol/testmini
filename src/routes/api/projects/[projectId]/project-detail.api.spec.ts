import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult, mockUpdateReturning } from '$lib/server/test-helpers/mock-db';
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

// requireProjectAccess and requireProjectRole need real-ish behavior
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

describe('/api/projects/[projectId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectAccess).mockResolvedValue({ role: 'PROJECT_ADMIN' });
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
	});

	describe('GET', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ params: { projectId: '1' }, user: null });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return 400 for invalid projectId', async () => {
			const event = createMockEvent({ params: { projectId: 'abc' }, user: testUser });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return 403 when user has no access', async () => {
			vi.mocked(authUtils.requireProjectAccess).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);
			const event = createMockEvent({ params: { projectId: '1' }, user: testUser });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return 404 when project not found', async () => {
			mockSelectResult(mockDb, []);
			const event = createMockEvent({ params: { projectId: '999' }, user: adminUser });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return project data on success', async () => {
			const projectWithCount = { ...sampleProject, memberCount: 3 };
			mockSelectResult(mockDb, [projectWithCount]);

			const event = createMockEvent({ params: { projectId: '1' }, user: adminUser });
			const response = await GET(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.data.id).toBe(projectWithCount.id);
			expect(body.data.name).toBe(projectWithCount.name);
			expect(body.data.memberCount).toBe(projectWithCount.memberCount);
		});
	});

	describe('PATCH', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: { projectId: '1' },
				body: { name: 'Updated' },
				user: null
			});
			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should return 403 when user lacks PROJECT_ADMIN role', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);
			const event = createMockEvent({
				method: 'PATCH',
				params: { projectId: '1' },
				body: { name: 'Updated' },
				user: testUser
			});
			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should return 400 for invalid body', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: { projectId: '1' },
				body: { name: '' },
				user: adminUser
			});
			const response = await PATCH(event);

			expect(response.status).toBe(400);
		});

		it('should update project on success', async () => {
			const updated = { ...sampleProject, name: 'Updated Project' };
			mockUpdateReturning(mockDb, [updated]);

			const event = createMockEvent({
				method: 'PATCH',
				params: { projectId: '1' },
				body: { name: 'Updated Project', description: '' },
				user: adminUser
			});
			const response = await PATCH(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.data.id).toBe(updated.id);
			expect(body.data.name).toBe(updated.name);
		});
	});

	describe('DELETE', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'DELETE',
				params: { projectId: '1' },
				user: null
			});
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 403 when user lacks PROJECT_ADMIN role', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);
			const event = createMockEvent({
				method: 'DELETE',
				params: { projectId: '1' },
				user: testUser
			});
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should deactivate project on success', async () => {
			const deactivated = { ...sampleProject, active: false };
			mockUpdateReturning(mockDb, [deactivated]);

			const event = createMockEvent({
				method: 'DELETE',
				params: { projectId: '1' },
				user: adminUser
			});
			const response = await DELETE(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.data.active).toBe(false);
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
	});
});
