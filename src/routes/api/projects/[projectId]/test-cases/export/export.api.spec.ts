import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, sampleTestCase, sampleTestCaseVersion } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testCase: { id: 'id', projectId: 'project_id', key: 'key', groupId: 'group_id', latestVersionId: 'latest_version_id' },
	testCaseVersion: { id: 'id', title: 'title', priority: 'priority', precondition: 'precondition', steps: 'steps', expectedResult: 'expected_result' },
	testCaseGroup: { id: 'id', name: 'name', projectId: 'project_id' },
	tag: { id: 'id', name: 'name', projectId: 'project_id' },
	testCaseTag: { testCaseId: 'test_case_id', tagId: 'tag_id' }
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	asc: vi.fn((a: unknown) => ['asc', a])
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});

const { GET } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1' };

describe('/api/projects/[projectId]/test-cases/export', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectAccess).mockResolvedValue({ role: 'QA' });
	});

	describe('GET', () => {
		it('should return 401 when unauthenticated', async () => {
			const event = createMockEvent({ method: 'GET', params: PARAMS, user: null });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return 400 for invalid format', async () => {
			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				searchParams: { format: 'xml' },
				user: testUser
			});
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return CSV data', async () => {
			const tcRow = {
				id: sampleTestCase.id,
				key: sampleTestCase.key,
				groupId: null,
				title: sampleTestCaseVersion.title,
				priority: sampleTestCaseVersion.priority,
				precondition: sampleTestCaseVersion.precondition,
				steps: sampleTestCaseVersion.steps,
				expectedResult: sampleTestCaseVersion.expectedResult
			};

			let selectCallCount = 0;
			const makeSelectChain = (result: unknown[]) => ({
				from: vi.fn().mockReturnThis(),
				innerJoin: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				orderBy: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(result).then(r)
			});

			mockDb.select.mockImplementation(() => {
				selectCallCount++;
				if (selectCallCount === 1) return makeSelectChain([tcRow]) as never;
				if (selectCallCount === 2) return makeSelectChain([]) as never;
				return makeSelectChain([]) as never;
			});

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser
			});
			const response = await GET(event);

			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toContain('text/csv');
			expect(response.headers.get('Content-Disposition')).toContain('test-cases.csv');

			const text = await response.text();
			expect(text).toContain('Key');
			expect(text).toContain('Title');
			expect(text).toContain(sampleTestCase.key);
		});

		it('should return JSON data when format=json', async () => {
			const tcRow = {
				id: sampleTestCase.id,
				key: sampleTestCase.key,
				groupId: null,
				title: sampleTestCaseVersion.title,
				priority: sampleTestCaseVersion.priority,
				precondition: sampleTestCaseVersion.precondition,
				steps: sampleTestCaseVersion.steps,
				expectedResult: sampleTestCaseVersion.expectedResult
			};

			let selectCallCount = 0;
			const makeSelectChain = (result: unknown[]) => ({
				from: vi.fn().mockReturnThis(),
				innerJoin: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				orderBy: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(result).then(r)
			});

			mockDb.select.mockImplementation(() => {
				selectCallCount++;
				if (selectCallCount === 1) return makeSelectChain([tcRow]) as never;
				if (selectCallCount === 2) return makeSelectChain([]) as never;
				return makeSelectChain([]) as never;
			});

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				searchParams: { format: 'json' },
				user: testUser
			});
			const response = await GET(event);

			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toContain('application/json');
			expect(response.headers.get('Content-Disposition')).toContain('test-cases.json');

			const body = await response.json();
			expect(body.testCases).toHaveLength(1);
			expect(body.testCases[0].key).toBe(sampleTestCase.key);
		});
	});
});
