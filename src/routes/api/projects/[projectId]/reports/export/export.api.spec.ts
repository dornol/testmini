import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { adminUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testRun: { id: 'id', name: 'name', environment: 'environment', projectId: 'project_id' },
	testExecution: { id: 'id', testRunId: 'test_run_id', testCaseVersionId: 'test_case_version_id', status: 'status', comment: 'comment', executedBy: 'executed_by', executedAt: 'executed_at' },
	testCaseVersion: { id: 'id', testCaseId: 'test_case_id', title: 'title', priority: 'priority' },
	testCase: { id: 'id', key: 'key' },
	testFailureDetail: { testExecutionId: 'test_execution_id', errorMessage: 'error_message' },
	user: { id: 'id', name: 'name' },
	projectMember: { projectId: 'project_id', userId: 'user_id', role: 'role' }
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	inArray: vi.fn((a: unknown, b: unknown) => ['inArray', a, b]),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({
			as: () => ({ sql: strings, values })
		}),
		{ raw: (s: string) => s }
	)
}));

// Import after mocks
const { GET } = await import('./+server');

describe('/api/projects/[projectId]/reports/export', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET', () => {
		it('should return 400 when run IDs exceed 20', async () => {
			const runIds = Array.from({ length: 21 }, (_, i) => i + 1).join(',');

			const event = createMockEvent({
				method: 'GET',
				params: { projectId: '1' },
				searchParams: { runs: runIds },
				user: adminUser
			});
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return 400 when runs param is missing', async () => {
			const event = createMockEvent({
				method: 'GET',
				params: { projectId: '1' },
				user: adminUser
			});
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return 400 when runs param is empty', async () => {
			const event = createMockEvent({
				method: 'GET',
				params: { projectId: '1' },
				searchParams: { runs: '' },
				user: adminUser
			});
			await expect(GET(event)).rejects.toThrow();
		});
	});
});
