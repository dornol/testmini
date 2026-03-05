import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { adminUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testCase: { id: 'id', projectId: 'project_id', groupId: 'group_id', sortOrder: 'sort_order' }
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	inArray: vi.fn((a: unknown, b: unknown) => ['inArray', a, b])
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});

const { PUT } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1' };

describe('/api/projects/[projectId]/test-cases/reorder', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
	});

	describe('PUT', () => {
		it('should return 400 for negative sortOrder', async () => {
			const event = createMockEvent({
				method: 'PUT',
				params: PARAMS,
				body: { items: [{ id: 10, groupId: null, sortOrder: -5 }] },
				user: adminUser
			});
			const response = await PUT(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toBe('sortOrder must be a non-negative integer');
		});

		it('should return 400 when test cases do not belong to project', async () => {
			// Return fewer items than requested, simulating some not belonging to the project
			mockSelectResult(mockDb, [{ id: 10 }]);

			const event = createMockEvent({
				method: 'PUT',
				params: PARAMS,
				body: {
					items: [
						{ id: 10, groupId: null, sortOrder: 0 },
						{ id: 999, groupId: null, sortOrder: 1 }
					]
				},
				user: adminUser
			});
			const response = await PUT(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toBe('Some test cases do not belong to this project');
		});
	});
});
