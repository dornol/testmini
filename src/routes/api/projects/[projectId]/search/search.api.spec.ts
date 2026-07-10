import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

function chainResult(result: unknown[]) {
	const chain: Record<string, unknown> = {};
	for (const method of ['from', 'innerJoin', 'where', 'orderBy', 'limit']) {
		chain[method] = vi.fn().mockReturnValue(chain);
	}
	chain.then = (resolve: (value: unknown[]) => void) => Promise.resolve(result).then(resolve);
	return chain;
}

function mockSelectResults(...results: unknown[][]) {
	mockDb.select.mockImplementation(() => chainResult(results.shift() ?? []));
}

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	testCase: {
		id: 'test_case.id',
		key: 'test_case.key',
		automationKey: 'test_case.automation_key',
		projectId: 'test_case.project_id',
		latestVersionId: 'test_case.latest_version_id',
		updatedAt: 'test_case.updated_at'
	},
	testCaseVersion: {
		id: 'test_case_version.id',
		title: 'test_case_version.title',
		priority: 'test_case_version.priority'
	},
	testRun: {
		id: 'test_run.id',
		name: 'test_run.name',
		environment: 'test_run.environment',
		status: 'test_run.status',
		projectId: 'test_run.project_id',
		createdAt: 'test_run.created_at'
	},
	requirement: {
		id: 'requirement.id',
		externalId: 'requirement.external_id',
		title: 'requirement.title',
		source: 'requirement.source',
		projectId: 'requirement.project_id',
		createdAt: 'requirement.created_at'
	},
	testPlan: {
		id: 'test_plan.id',
		name: 'test_plan.name',
		status: 'test_plan.status',
		milestone: 'test_plan.milestone',
		projectId: 'test_plan.project_id',
		createdAt: 'test_plan.created_at'
	},
	release: {
		id: 'release.id',
		name: 'release.name',
		version: 'release.version',
		status: 'release.status',
		projectId: 'release.project_id',
		createdAt: 'release.created_at'
	}
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => ['and', ...args]),
	desc: vi.fn((field: unknown) => ['desc', field]),
	eq: vi.fn((field: unknown, value: unknown) => ['eq', field, value]),
	ilike: vi.fn((field: unknown, value: unknown) => ['ilike', field, value]),
	or: vi.fn((...args: unknown[]) => ['or', ...args])
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});

const { GET } = await import('./+server');
const drizzle = await import('drizzle-orm');
const authUtils = await import('$lib/server/auth-utils');

describe('/api/projects/[projectId]/search', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectAccess).mockResolvedValue({ role: 'QA' });
	});

	it('returns no results for short queries without hitting the database', async () => {
		const response = await GET(
			createMockEvent({
				method: 'GET',
				params: { projectId: '1' },
				searchParams: { q: 'a' },
				user: testUser
			})
		);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data).toEqual({ results: [] });
		expect(mockDb.select).not.toHaveBeenCalled();
	});

	it('rejects overlong queries before hitting the database', async () => {
		const response = await GET(
			createMockEvent({
				method: 'GET',
				params: { projectId: '1' },
				searchParams: { q: 'a'.repeat(101) },
				user: testUser
			})
		);

		expect(response.status).toBe(400);
		expect(mockDb.select).not.toHaveBeenCalled();
	});

	it('searches project entities and maps them to navigation results', async () => {
		mockSelectResults(
			[{ id: 10, key: 'TC-10', title: 'Login succeeds', priority: 'HIGH' }],
			[{ id: 20, name: 'Regression Login', environment: 'staging', status: 'ACTIVE' }],
			[{ id: 30, externalId: 'REQ-30', title: 'Login requirement', source: 'Jira' }],
			[{ id: 40, name: 'Login Plan', status: 'DRAFT', milestone: 'M1' }],
			[{ id: 50, name: 'Login Release', version: 'v1.2', status: 'PLANNING' }]
		);

		const response = await GET(
			createMockEvent({
				method: 'GET',
				params: { projectId: '7' },
				searchParams: { q: '  Login  ' },
				user: testUser
			})
		);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(mockDb.select).toHaveBeenCalledTimes(5);
		expect(drizzle.ilike).toHaveBeenCalledWith('test_case_version.title', '%Login%');
		expect(data.results).toEqual([
			{
				type: 'test_case',
				id: 10,
				title: 'TC-10 Login succeeds',
				subtitle: 'HIGH',
				url: '/projects/7/test-cases/10'
			},
			{
				type: 'test_run',
				id: 20,
				title: 'Regression Login',
				subtitle: 'staging · ACTIVE',
				url: '/projects/7/test-runs/20'
			},
			{
				type: 'requirement',
				id: 30,
				title: 'REQ-30 Login requirement',
				subtitle: 'Jira',
				url: '/projects/7/traceability?requirementId=30'
			},
			{
				type: 'test_plan',
				id: 40,
				title: 'Login Plan',
				subtitle: 'DRAFT · M1',
				url: '/projects/7/test-plans/40'
			},
			{
				type: 'release',
				id: 50,
				title: 'Login Release v1.2',
				subtitle: 'PLANNING',
				url: '/projects/7/releases/50'
			}
		]);
	});
});
