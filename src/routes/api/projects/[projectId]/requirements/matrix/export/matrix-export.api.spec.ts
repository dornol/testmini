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
	desc: vi.fn((a: unknown) => a)
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

describe('/api/projects/[projectId]/requirements/matrix/export', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should return 401 when not authenticated', async () => {
		const event = createMockEvent({ method: 'GET', params: PARAMS, user: null });
		await expect(GET(event)).rejects.toThrow();
	});

	it('should return CSV with correct headers', async () => {
		mockSelectResult(mockDb, []);

		const event = createMockEvent({
			method: 'GET',
			params: PARAMS,
			user: testUser
		});

		const response = await GET(event);
		expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
		expect(response.headers.get('Content-Disposition')).toContain('traceability_matrix.csv');

		const text = await response.text();
		// BOM + header row
		expect(text).toContain('Requirement ID');
		expect(text).toContain('External ID');
		expect(text).toContain('Title');
		expect(text).toContain('Source');
		expect(text).toContain('Test Case Key');
		expect(text).toContain('Test Case Title');
		expect(text).toContain('Latest Status');
	});

	it('should return only header row when no requirements exist', async () => {
		mockSelectResult(mockDb, []);

		const event = createMockEvent({
			method: 'GET',
			params: PARAMS,
			user: testUser
		});

		const response = await GET(event);
		const text = await response.text();
		// Remove BOM, split lines
		const lines = text.replace('\uFEFF', '').split('\n');
		// Only header row, no data rows
		expect(lines).toHaveLength(1);
	});

	it('should output CSV rows for requirements', async () => {
		// All db.select() calls return the same mock data, so requirements
		// will have links. We verify the CSV format is correct.
		mockSelectResult(mockDb, [
			{ id: 1, externalId: 'REQ-001', title: 'Login requirement', source: 'PRD', testCaseId: 1, key: 'TC-001', status: 'PASS' }
		]);

		const event = createMockEvent({
			method: 'GET',
			params: PARAMS,
			user: testUser
		});

		const response = await GET(event);
		const text = await response.text();
		expect(text).toContain('REQ-001');
		expect(text).toContain('Login requirement');
	});

	it('should include Content-Disposition with filename', async () => {
		mockSelectResult(mockDb, []);

		const event = createMockEvent({
			method: 'GET',
			params: PARAMS,
			user: testUser
		});

		const response = await GET(event);
		const disposition = response.headers.get('Content-Disposition');
		expect(disposition).toBe('attachment; filename="traceability_matrix.csv"');
	});
});
