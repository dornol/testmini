import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	sharedReport: {
		id: 'id',
		projectId: 'project_id',
		token: 'token',
		name: 'name',
		config: 'config',
		expiresAt: 'expires_at',
		createdBy: 'created_by',
		createdAt: 'created_at'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	desc: vi.fn((a: unknown) => a),
	sql: vi.fn(),
	inArray: vi.fn((a: unknown, b: unknown) => [a, b]),
	count: vi.fn()
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

const { DELETE } = await import('./+server');

const PARAMS = { projectId: '1', shareId: '10' };

const sampleDeletedReport = {
	id: 10,
	projectId: 1,
	token: 'abc123',
	name: 'Old Report',
	config: {},
	expiresAt: null,
	createdBy: 'user-1',
	createdAt: new Date('2025-01-01')
};

describe('/api/projects/[projectId]/reports/share/[shareId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('DELETE', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: null });
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should reject invalid shareId', async () => {
			const event = createMockEvent({
				method: 'DELETE',
				params: { projectId: '1', shareId: 'abc' },
				user: testUser
			});

			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 404 when shared report not found', async () => {
			const chain = {
				where: vi.fn().mockReturnThis(),
				returning: vi.fn().mockReturnThis(),
				then: (resolve: (v: unknown) => void) => Promise.resolve([]).then(resolve)
			};
			mockDb.delete.mockReturnValue(chain as never);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser
			});

			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should delete shared report and return success', async () => {
			const chain = {
				where: vi.fn().mockReturnThis(),
				returning: vi.fn().mockReturnThis(),
				then: (resolve: (v: unknown) => void) =>
					Promise.resolve([sampleDeletedReport]).then(resolve)
			};
			mockDb.delete.mockReturnValue(chain as never);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser
			});

			const response = await DELETE(event);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.success).toBe(true);
		});
	});
});
