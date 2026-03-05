import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, sampleTestCase, sampleTestCaseVersion } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testCase: { id: 'id', projectId: 'project_id', key: 'key', groupId: 'group_id', sortOrder: 'sort_order', latestVersionId: 'latest_version_id' },
	testCaseVersion: { id: 'id', testCaseId: 'test_case_id', versionNo: 'version_no', title: 'title', precondition: 'precondition', steps: 'steps', expectedResult: 'expected_result', priority: 'priority', updatedBy: 'updated_by' },
	testCaseTag: { testCaseId: 'test_case_id', tagId: 'tag_id' }
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({
			as: () => ({ sql: strings, values })
		}),
		{ raw: (s: string) => s }
	)
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});

const { POST } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1', testCaseId: '10' };

describe('/api/projects/[projectId]/test-cases/[testCaseId]/clone', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'QA' });
	});

	describe('POST', () => {
		it('should return 401 when unauthenticated', async () => {
			const event = createMockEvent({ method: 'POST', params: PARAMS, user: null });
			await expect(POST(event)).rejects.toThrow();
		});

		it('should return 403 for VIEWER', async () => {
			vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
				Object.assign(new Error('Forbidden'), { status: 403 })
			);
			const event = createMockEvent({ method: 'POST', params: PARAMS, user: testUser });
			await expect(POST(event)).rejects.toThrow();
		});

		it('should clone test case for non-VIEWER', async () => {
			const tc = { ...sampleTestCase, latestVersion: sampleTestCaseVersion };
			mockDb.query.testCase.findFirst.mockResolvedValue(tc);

			const newTestCaseId = 11;
			const newVersion = { ...sampleTestCaseVersion, id: 101, testCaseId: newTestCaseId };

			mockDb.transaction.mockImplementation(async (fn) => {
				// max key select returns TC-0001, so nextNum = 2, newKey = TC-0002
				const txMaxKeyChain = {
					from: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					then: (r: (v: unknown) => void) =>
						Promise.resolve([{ maxKey: 'TC-0001' }]).then(r)
				};
				// max sort order select returns 0
				const txMaxSortChain = {
					from: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					then: (r: (v: unknown) => void) =>
						Promise.resolve([{ maxOrder: 0 }]).then(r)
				};
				// tags select returns empty
				const txTagsChain = {
					from: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					then: (r: (v: unknown) => void) => Promise.resolve([]).then(r)
				};

				const txInsertCaseChain = {
					values: vi.fn().mockReturnThis(),
					returning: vi.fn().mockResolvedValue([{ ...sampleTestCase, id: newTestCaseId, key: 'TC-0002' }])
				};
				const txInsertVersionChain = {
					values: vi.fn().mockReturnThis(),
					returning: vi.fn().mockResolvedValue([newVersion])
				};
				const txUpdateChain = {
					set: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
				};

				let selectCallCount = 0;
				let insertCallCount = 0;
				const tx = {
					select: vi.fn().mockImplementation(() => {
						selectCallCount++;
						if (selectCallCount === 1) return txMaxKeyChain;
						if (selectCallCount === 2) return txMaxSortChain;
						return txTagsChain;
					}),
					insert: vi.fn().mockImplementation(() => {
						insertCallCount++;
						if (insertCallCount === 1) return txInsertCaseChain;
						return txInsertVersionChain;
					}),
					update: vi.fn().mockReturnValue(txUpdateChain)
				};
				return fn(tx);
			});

			const event = createMockEvent({ method: 'POST', params: PARAMS, user: testUser });
			const response = await POST(event);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);
			expect(body.newTestCaseId).toBe(newTestCaseId);
			expect(body.newKey).toBe('TC-0002');
		});
	});
});
