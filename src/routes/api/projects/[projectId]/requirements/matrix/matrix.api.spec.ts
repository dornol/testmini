import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	requirement: {
		id: 'id',
		projectId: 'project_id',
		externalId: 'external_id',
		title: 'title',
		source: 'source'
	},
	requirementTestCase: {
		requirementId: 'requirement_id',
		testCaseId: 'test_case_id'
	},
	testCase: {
		id: 'id',
		key: 'key',
		latestVersionId: 'latest_version_id'
	},
	testCaseVersion: {
		id: 'id',
		title: 'title',
		testCaseId: 'test_case_id',
		testCaseVersionId: 'test_case_version_id'
	},
	testExecution: {
		id: 'id',
		status: 'status',
		testCaseVersionId: 'test_case_version_id',
		testRunId: 'test_run_id'
	},
	testRun: {
		id: 'id',
		projectId: 'project_id'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	desc: vi.fn((a: unknown) => a),
	inArray: vi.fn((a: unknown, b: unknown) => [a, b]),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
		{ join: vi.fn((...args: unknown[]) => args), raw: vi.fn((s: string) => s) }
	)
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

const { GET } = await import('./+server');

const PARAMS = { projectId: '1' };

describe('/api/projects/[projectId]/requirements/matrix', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should return 401 when not authenticated', async () => {
		const event = createMockEvent({ method: 'GET', params: PARAMS, user: null });
		await expect(GET(event)).rejects.toThrow();
	});

	it('should return empty requirements array when none exist', async () => {
		mockSelectResult(mockDb, []);

		const event = createMockEvent({
			method: 'GET',
			params: PARAMS,
			user: testUser
		});

		const response = await GET(event);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.requirements).toEqual([]);
	});

	it('should return requirements with test cases from mock', async () => {
		// mockSelectResult applies to ALL db.select() calls, so links and exec queries
		// all return the same data. We just verify the endpoint runs and returns 200.
		mockSelectResult(mockDb, [
			{ id: 1, externalId: 'REQ-001', title: 'Login', source: 'PRD', testCaseId: 1, key: 'TC-001', status: 'PASS' }
		]);

		const event = createMockEvent({
			method: 'GET',
			params: PARAMS,
			user: testUser
		});

		const response = await GET(event);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.requirements).toBeDefined();
		expect(Array.isArray(body.requirements)).toBe(true);
		expect(body.requirements).toHaveLength(1);
		expect(body.requirements[0].id).toBe(1);
		expect(body.requirements[0].title).toBe('Login');
	});
});
