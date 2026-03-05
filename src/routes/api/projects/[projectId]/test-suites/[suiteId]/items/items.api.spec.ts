import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { adminUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
// The items endpoint uses db.query.testSuite.findFirst
(mockDb.query as Record<string, unknown>).testSuite = { findFirst: vi.fn() };

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testSuite: { id: 'id', projectId: 'project_id' },
	testSuiteItem: { suiteId: 'suite_id', testCaseId: 'test_case_id' },
	testCase: { id: 'id', projectId: 'project_id' }
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

const { POST } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1', suiteId: '5' };

describe('/api/projects/[projectId]/test-suites/[suiteId]/items', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
		// Default: suite exists
		vi.mocked((mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testSuite.findFirst).mockResolvedValue({ id: 5, projectId: 1 });
	});

	describe('POST', () => {
		it('should return 400 when test cases do not belong to project', async () => {
			// Return fewer test cases than requested, simulating some not belonging to the project
			mockSelectResult(mockDb, [{ id: 10 }]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				body: { testCaseIds: [10, 999] },
				user: adminUser
			});
			const response = await POST(event);

			expect(response.status).toBe(400);
			const data = await response.json();
			expect(data.error).toBe('Some test cases do not belong to this project');
		});
	});
});
