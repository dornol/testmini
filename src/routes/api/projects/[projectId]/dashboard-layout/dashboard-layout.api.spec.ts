import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	dashboardLayout: {
		userId: 'user_id',
		projectId: 'project_id'
	},
	projectMember: { projectId: 'project_id', userId: 'user_id' }
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b])
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'MEMBER' })
	};
});

const { GET, PUT } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

describe('/api/projects/[projectId]/dashboard-layout', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectAccess).mockResolvedValue({ role: 'MEMBER' });
	});

	describe('GET', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ params: { projectId: '1' }, user: null });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return default layout when no saved layout exists', async () => {
			mockDb.query.dashboardLayout = { findFirst: vi.fn().mockResolvedValue(undefined) };

			const event = createMockEvent({ params: { projectId: '1' }, user: testUser });
			const response = await GET(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(Array.isArray(body.layout)).toBe(true);
			expect(body.layout.length).toBeGreaterThan(0);
			// Each entry in DEFAULT_LAYOUT has these fields
			expect(body.layout[0]).toMatchObject({
				id: expect.any(String),
				visible: expect.any(Boolean),
				order: expect.any(Number),
				size: expect.any(String)
			});
			// Verify the first widget matches the first WIDGET_DEFINITION
			expect(body.layout[0].id).toBe('stats_summary');
			expect(body.layout[0].size).toBe('lg');
		});

		it('should return saved layout when one exists', async () => {
			const savedLayout = [
				{ id: 'stats_summary', visible: true, order: 0, size: 'md' },
				{ id: 'pass_rate_trend', visible: false, order: 1, size: 'sm' }
			];
			mockDb.query.dashboardLayout = {
				findFirst: vi.fn().mockResolvedValue({ layout: savedLayout })
			};

			const event = createMockEvent({ params: { projectId: '1' }, user: testUser });
			const response = await GET(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(Array.isArray(body.layout)).toBe(true);
			// Saved widgets that still exist in WIDGET_DEFINITIONS are kept
			const statsSummary = body.layout.find((w: { id: string }) => w.id === 'stats_summary');
			expect(statsSummary).toBeDefined();
			expect(statsSummary.size).toBe('md');
			// Widgets not in saved layout are appended with defaults
			// (status_distribution, recent_runs, priority_breakdown, top_failing are not in savedLayout)
			const statusDist = body.layout.find((w: { id: string }) => w.id === 'status_distribution');
			expect(statusDist).toBeDefined();
			expect(statusDist.visible).toBe(true);
			expect(statusDist.size).toBe('md');
		});

		it('should return 400 for invalid projectId', async () => {
			const event = createMockEvent({ params: { projectId: 'abc' }, user: testUser });
			await expect(GET(event)).rejects.toThrow();
		});
	});

	describe('PUT', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: { projectId: '1' },
				body: { layout: [] },
				user: null
			});
			await expect(PUT(event)).rejects.toThrow();
		});

		it('should save layout for authenticated user', async () => {
			const layout = [
				{ id: 'stats_summary', visible: true, order: 0, size: 'lg' },
				{ id: 'pass_rate_trend', visible: false, order: 1, size: 'md' }
			];

			const event = createMockEvent({
				method: 'PUT',
				params: { projectId: '1' },
				body: { layout },
				user: testUser
			});
			const response = await PUT(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.layout).toEqual(layout);
			expect(mockDb.insert).toHaveBeenCalled();
		});

		it('should return 400 when layout field is missing', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: { projectId: '1' },
				body: {},
				user: testUser
			});
			await expect(PUT(event)).rejects.toThrow();
		});

		it('should return 400 when layout is not an array', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: { projectId: '1' },
				body: { layout: 'not-an-array' },
				user: testUser
			});
			await expect(PUT(event)).rejects.toThrow();
		});

		it('should return 400 for invalid widget config missing required fields', async () => {
			// Missing 'visible' boolean field
			const event = createMockEvent({
				method: 'PUT',
				params: { projectId: '1' },
				body: { layout: [{ id: 'stats_summary', order: 0, size: 'md' }] },
				user: testUser
			});
			await expect(PUT(event)).rejects.toThrow();
		});

		it('should return 400 for invalid size value', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: { projectId: '1' },
				body: { layout: [{ id: 'stats_summary', visible: true, order: 0, size: 'xl' }] },
				user: testUser
			});
			await expect(PUT(event)).rejects.toThrow();
		});

		it('should return 400 for unknown widget id', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: { projectId: '1' },
				body: { layout: [{ id: 'unknown_widget', visible: true, order: 0, size: 'sm' }] },
				user: testUser
			});
			await expect(PUT(event)).rejects.toThrow();
		});
	});
});
