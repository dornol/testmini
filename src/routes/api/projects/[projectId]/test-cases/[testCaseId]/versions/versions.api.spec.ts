import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, sampleTestCase, sampleTestCaseVersion } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testCase: { id: 'id', projectId: 'project_id' },
	testCaseVersion: {
		id: 'id',
		testCaseId: 'test_case_id',
		versionNo: 'version_no',
		title: 'title',
		precondition: 'precondition',
		steps: 'steps',
		expectedResult: 'expected_result',
		priority: 'priority',
		createdAt: 'created_at',
		updatedBy: 'updated_by'
	},
	user: { id: 'id', name: 'name' }
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b])
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

const PARAMS = { projectId: '1', testCaseId: '10' };

describe('/api/projects/[projectId]/test-cases/[testCaseId]/versions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectAccess).mockResolvedValue({ role: 'QA' });
	});

	describe('GET', () => {
		it('should return 401 when unauthenticated', async () => {
			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				searchParams: { v1: '1', v2: '2' },
				user: null
			});
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return 400 when v1 and v2 are the same', async () => {
			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				searchParams: { v1: '1', v2: '1' },
				user: testUser
			});
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return 400 when version params are missing', async () => {
			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser
			});
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return version history', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);

			const ver1 = { ...sampleTestCaseVersion, versionNo: 1, updatedBy: 'Test User' };
			const ver2 = { ...sampleTestCaseVersion, id: 101, versionNo: 2, updatedBy: 'Test User' };

			let selectCallCount = 0;
			const makeSelectChain = (result: unknown[]) => ({
				from: vi.fn().mockReturnThis(),
				leftJoin: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(result).then(r)
			});

			mockDb.select.mockImplementation(() => {
				selectCallCount++;
				if (selectCallCount === 1) return makeSelectChain([ver1]) as never;
				return makeSelectChain([ver2]) as never;
			});

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				searchParams: { v1: '1', v2: '2' },
				user: testUser
			});
			const response = await GET(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.v1.versionNo).toBe(1);
			expect(body.v2.versionNo).toBe(2);
		});

		it('should return 404 when test case not found', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(null);

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				searchParams: { v1: '1', v2: '2' },
				user: testUser
			});
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return 404 when one of the versions is not found', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);

			let selectCallCount = 0;
			const makeSelectChain = (result: unknown[]) => ({
				from: vi.fn().mockReturnThis(),
				leftJoin: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (r: (v: unknown) => void) => Promise.resolve(result).then(r)
			});

			mockDb.select.mockImplementation(() => {
				selectCallCount++;
				if (selectCallCount === 1) return makeSelectChain([sampleTestCaseVersion]) as never;
				return makeSelectChain([]) as never;
			});

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				searchParams: { v1: '1', v2: '2' },
				user: testUser
			});
			await expect(GET(event)).rejects.toThrow();
		});
	});
});
