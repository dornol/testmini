import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testCase: {
		id: 'id',
		key: 'key',
		projectId: 'project_id',
		latestVersionId: 'latest_version_id'
	},
	testCaseVersion: {
		id: 'id',
		title: 'title'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b])
}));
vi.mock('$lib/server/auth-utils', () => ({
	requireAuth: vi.fn().mockReturnValue(testUser),
	requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' })
}));

const { load } = await import('./+page.server');

const sampleTestCases = [
	{ id: 1, key: 'TC-0001', title: 'Login test' },
	{ id: 2, key: 'TC-0002', title: 'Logout test' },
	{ id: 3, key: 'TC-0003', title: 'Registration test' }
];

function createLoadEvent(projectId = '1') {
	return {
		params: { projectId },
		locals: { user: testUser, session: { id: 'session-1' }, requestId: 'test-request-id' },
		parent: vi.fn().mockResolvedValue({})
	} as never;
}

describe('traceability +page.server.ts load', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should return projectId and allTestCases', async () => {
		mockSelectResult(mockDb, sampleTestCases);

		const result = await load(createLoadEvent('5'));

		expect(result.projectId).toBe(5);
		expect(result.allTestCases).toEqual(sampleTestCases);
	});

	it('should return empty array when no test cases exist', async () => {
		mockSelectResult(mockDb, []);

		const result = await load(createLoadEvent('1'));

		expect(result.projectId).toBe(1);
		expect(result.allTestCases).toEqual([]);
	});

	it('should call requireAuth with locals', async () => {
		const { requireAuth } = await import('$lib/server/auth-utils');
		mockSelectResult(mockDb, []);

		await load(createLoadEvent('1'));

		expect(requireAuth).toHaveBeenCalledWith(
			expect.objectContaining({ user: testUser })
		);
	});

	it('should call requireProjectAccess with correct projectId', async () => {
		const { requireProjectAccess } = await import('$lib/server/auth-utils');
		mockSelectResult(mockDb, []);

		await load(createLoadEvent('7'));

		expect(requireProjectAccess).toHaveBeenCalledWith(testUser, 7);
	});

	it('should query with correct select fields', async () => {
		mockSelectResult(mockDb, sampleTestCases);

		await load(createLoadEvent('1'));

		expect(mockDb.select).toHaveBeenCalledWith({
			id: 'id',
			key: 'key',
			title: 'title'
		});
	});

	it('should return multiple test cases preserving order', async () => {
		const manyTestCases = Array.from({ length: 100 }, (_, i) => ({
			id: i + 1,
			key: `TC-${String(i + 1).padStart(4, '0')}`,
			title: `Test case ${i + 1}`
		}));
		mockSelectResult(mockDb, manyTestCases);

		const result = await load(createLoadEvent('1'));

		expect(result.allTestCases).toHaveLength(100);
		expect(result.allTestCases[0].key).toBe('TC-0001');
		expect(result.allTestCases[99].key).toBe('TC-0100');
	});
});
