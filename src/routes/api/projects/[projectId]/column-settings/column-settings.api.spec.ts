import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
mockDb.query.project = { findFirst: vi.fn() };

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	project: { id: 'id', columnSettings: 'column_settings' }
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b])
}));

vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' }),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});

const { GET, PUT } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

describe('/api/projects/[projectId]/column-settings', () => {
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

		it('should return columnSettings when project has settings', async () => {
			const settings = [
				{ id: 'priority', visible: true },
				{ id: 'status', visible: false }
			];
			mockDb.query.project.findFirst.mockResolvedValue({ columnSettings: settings });

			const event = createMockEvent({ params: { projectId: '1' }, user: adminUser });
			const response = await GET(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.columnSettings).toEqual(settings);
		});

		it('should return null when project has no settings', async () => {
			mockDb.query.project.findFirst.mockResolvedValue({ columnSettings: null });

			const event = createMockEvent({ params: { projectId: '1' }, user: adminUser });
			const response = await GET(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.columnSettings).toBeNull();
		});

		it('should return null when project is not found', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(undefined);

			const event = createMockEvent({ params: { projectId: '999' }, user: adminUser });
			const response = await GET(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.columnSettings).toBeNull();
		});
	});

	describe('PUT', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: { projectId: '1' },
				body: { columnSettings: [] },
				user: null
			});
			await expect(PUT(event)).rejects.toThrow();
		});

		it('should return 403 when user is VIEWER', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
				Object.assign(new Error(), { status: 403, body: { message: 'Forbidden' } })
			);
			const event = createMockEvent({
				method: 'PUT',
				params: { projectId: '1' },
				body: { columnSettings: [] },
				user: testUser
			});
			await expect(PUT(event)).rejects.toThrow();
		});

		it('should return 400 when columnSettings is not an array', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: { projectId: '1' },
				body: { columnSettings: 'not-an-array' },
				user: adminUser
			});
			const response = await PUT(event);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toContain('array');
		});

		it('should return 400 when columnSettings is an object', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: { projectId: '1' },
				body: { columnSettings: { id: 'priority', visible: true } },
				user: adminUser
			});
			const response = await PUT(event);

			expect(response.status).toBe(400);
		});

		it('should return 400 when column item is missing id', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: { projectId: '1' },
				body: { columnSettings: [{ visible: true }] },
				user: adminUser
			});
			const response = await PUT(event);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toContain('id');
		});

		it('should return 400 when column item is missing visible', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: { projectId: '1' },
				body: { columnSettings: [{ id: 'priority' }] },
				user: adminUser
			});
			const response = await PUT(event);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toContain('visible');
		});

		it('should return 400 when id is not a string', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: { projectId: '1' },
				body: { columnSettings: [{ id: 123, visible: true }] },
				user: adminUser
			});
			const response = await PUT(event);

			expect(response.status).toBe(400);
		});

		it('should return 400 when visible is not a boolean', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: { projectId: '1' },
				body: { columnSettings: [{ id: 'priority', visible: 'yes' }] },
				user: adminUser
			});
			const response = await PUT(event);

			expect(response.status).toBe(400);
		});

		it('should save valid column settings successfully', async () => {
			const settings = [
				{ id: 'priority', visible: true },
				{ id: 'status', visible: false },
				{ id: 'assignee', visible: true }
			];
			const event = createMockEvent({
				method: 'PUT',
				params: { projectId: '1' },
				body: { columnSettings: settings },
				user: adminUser
			});
			const response = await PUT(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);
			expect(mockDb.update).toHaveBeenCalled();
		});

		it('should handle empty array (valid case)', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: { projectId: '1' },
				body: { columnSettings: [] },
				user: adminUser
			});
			const response = await PUT(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);
			expect(mockDb.update).toHaveBeenCalled();
		});
	});
});
