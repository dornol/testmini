import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => {
	const table = (fields: string[]) => Object.fromEntries(fields.map((field) => [field, field]));
	return {
		notification: table(['id', 'userId', 'type', 'title', 'message', 'link', 'projectId', 'isRead', 'createdAt']),
		project: table(['id', 'name', 'active']),
		projectMember: table(['projectId', 'userId', 'role']),
		testCase: table(['id', 'projectId', 'key', 'latestVersionId', 'retestNeeded', 'approvalStatus', 'createdBy', 'updatedAt']),
		testCaseAssignee: table(['testCaseId', 'userId', 'assignedAt']),
		testCaseVersion: table(['id', 'testCaseId', 'title', 'priority']),
		testExecution: table(['id', 'testRunId', 'testCaseVersionId', 'status']),
		testPlan: table(['id', 'projectId', 'name', 'status', 'endDate', 'updatedAt']),
		testPlanTestCase: table(['testPlanId', 'testCaseId']),
		testRun: table(['id', 'projectId', 'name', 'status', 'createdAt'])
	};
});
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...conditions: unknown[]) => conditions),
	desc: vi.fn((column: unknown) => ['desc', column]),
	eq: vi.fn((left: unknown, right: unknown) => ['eq', left, right]),
	gte: vi.fn((left: unknown, right: unknown) => ['gte', left, right]),
	inArray: vi.fn((left: unknown, right: unknown) => ['inArray', left, right]),
	lte: vi.fn((left: unknown, right: unknown) => ['lte', left, right]),
	ne: vi.fn((left: unknown, right: unknown) => ['ne', left, right])
}));

const { load } = await import('./+page.server');

function chain(result: unknown[]) {
	const query: Record<string, unknown> = {};
	for (const method of ['from', 'innerJoin', 'where', 'orderBy', 'limit']) {
		query[method] = vi.fn().mockReturnValue(query);
	}
	query.then = (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve);
	return query;
}

function event(search = '') {
	return {
		locals: { user: testUser },
		url: new URL(`http://localhost:5173/my-work${search}`)
	} as never;
}

describe('My Work page server', () => {
	beforeEach(() => vi.clearAllMocks());

	it('aggregates scoped work with stable deep links and counts', async () => {
		const date = new Date('2026-07-13T00:00:00Z');
		const selectResults = [
			[{ id: 1, projectId: 10, projectName: 'Alpha', key: 'TC-1', title: 'Login', priority: 'HIGH', retestNeeded: false, assignedAt: date }],
			[{ id: 2, projectId: 10, projectName: 'Alpha', key: 'TC-2', title: 'Review', priority: 'CRITICAL', updatedAt: date }],
			[{ id: 3, projectId: 10, projectName: 'Alpha', runId: 4, runName: 'Smoke', caseKey: 'TC-3', caseTitle: 'Checkout', priority: 'MEDIUM', createdAt: date }],
			[{ id: 5, type: 'MENTION', title: 'Mentioned', message: 'Please check', link: '/projects/10/test-cases/1#comments', projectId: 10, projectName: 'Alpha', createdAt: date }],
			[{ id: 10, name: 'Alpha' }]
		];
		let call = 0;
		mockDb.select.mockImplementation(() => chain(selectResults[call++]));
		mockDb.selectDistinct.mockReturnValue(
			chain([{ id: 6, projectId: 10, projectName: 'Alpha', name: 'Release Plan', endDate: new Date('2026-07-15T00:00:00Z'), updatedAt: date }]) as never
		);

		const result = (await load(event())) as Record<string, any>;

		expect(result.items).toHaveLength(5);
		expect(result.counts).toMatchObject({ ALL: 5, ASSIGNED: 1, APPROVAL: 1, EXECUTION: 1, MENTION: 1, DUE_SOON: 1 });
		expect(result.items.map((item: { href: string }) => item.href)).toEqual(expect.arrayContaining([
			'/projects/10/test-cases/1',
			'/projects/10/test-cases/2#approval',
			'/projects/10/test-runs/4?execution=3',
			'/projects/10/test-cases/1#comments',
			'/projects/10/test-plans/6'
		]));
	});

	it('applies URL filters after computing unfiltered summary counts', async () => {
		const date = new Date('2026-07-13T00:00:00Z');
		const assigned = [
			{ id: 1, projectId: 10, projectName: 'Alpha', key: 'TC-1', title: 'Login', priority: 'HIGH', retestNeeded: false, assignedAt: date },
			{ id: 2, projectId: 20, projectName: 'Beta', key: 'TC-2', title: 'Pay', priority: 'LOW', retestNeeded: true, assignedAt: date }
		];
		let call = 0;
		const results = [assigned, [], [], [], [{ id: 10, name: 'Alpha' }, { id: 20, name: 'Beta' }]];
		mockDb.select.mockImplementation(() => chain(results[call++]));
		mockDb.selectDistinct.mockReturnValue(chain([]) as never);

		const result = (await load(event('?type=RETEST&project=20&priority=LOW'))) as Record<string, any>;

		expect(result.items.map((item: { id: string }) => item.id)).toEqual(['case-2']);
		expect(result.counts).toMatchObject({ ALL: 2, ASSIGNED: 1, RETEST: 1 });
		expect(result.filters).toEqual({ type: 'RETEST', projectId: 20, priority: 'LOW' });
	});
});
