/**
 * Optimistic concurrency tests for the test-case PUT route.
 *
 * The PUT handler checks that the `revision` supplied by the client matches
 * the `revision` stored in the latest version row.  A mismatch means another
 * user has saved the test case since the client last loaded it; the server
 * must reject the write with 409 Conflict.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import {
	testUser,
	adminUser,
	sampleTestCase,
	sampleTestCaseVersion
} from '$lib/server/test-helpers/fixtures';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the route handler
// ---------------------------------------------------------------------------

const mockDb = createMockDb();
const mockFindTC = vi.fn();

vi.mock('$lib/server/db', () => ({ db: mockDb, findTestCaseWithLatestVersion: mockFindTC }));
vi.mock('$lib/server/db/schema', () => ({
	testCase: {
		id: 'id',
		projectId: 'project_id',
		key: 'key',
		latestVersionId: 'latest_version_id'
	},
	testCaseVersion: {
		id: 'id',
		testCaseId: 'test_case_id',
		versionNo: 'version_no',
		title: 'title',
		precondition: 'precondition',
		steps: 'steps',
		expectedResult: 'expected_result',
		priority: 'priority',
		revision: 'revision',
		updatedBy: 'updated_by',
		createdAt: 'created_at'
	},
	user: { id: 'id', name: 'name', image: 'image' },
	tag: { id: 'id', name: 'name', color: 'color', projectId: 'project_id' },
	testCaseTag: { testCaseId: 'test_case_id', tagId: 'tag_id' },
	testCaseAssignee: { testCaseId: 'test_case_id', userId: 'user_id' },
	projectMember: { projectId: 'project_id', userId: 'user_id' }
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	desc: vi.fn((a: unknown) => ['desc', a]),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({
			as: () => ({ sql: strings, values })
		}),
		{ raw: (s: string) => s }
	)
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/server/auth-utils')>('$lib/server/auth-utils');
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});

const { PUT } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

const PARAMS = { projectId: '1', testCaseId: '10' };

/** Minimal valid body for a PUT request. */
function validBody(revision: number, overrides: Record<string, unknown> = {}) {
	return {
		title: 'Login should work',
		precondition: 'User exists',
		steps: [{ action: 'Enter credentials', expected: 'Login success' }],
		expectedResult: 'Redirected to dashboard',
		priority: 'MEDIUM',
		revision,
		...overrides
	};
}

/**
 * Sets up the db transaction mock so that the insert inside the transaction
 * resolves to `newVersion` and the subsequent update resolves without error.
 */
function mockSuccessfulTransaction(newVersion: typeof sampleTestCaseVersion) {
	mockDb.transaction.mockImplementation(async (fn) => {
		const txChain = {
			values: vi.fn().mockReturnThis(),
			returning: vi.fn().mockResolvedValue([newVersion]),
			set: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			then: undefined as unknown
		};
		txChain.then = (r: (v: unknown) => void) => Promise.resolve([newVersion]).then(r);
		const tx = {
			insert: vi.fn().mockReturnValue(txChain),
			update: vi.fn().mockReturnValue(txChain)
		};
		return fn(tx);
	});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PUT /api/projects/[projectId]/test-cases/[testCaseId] — optimistic concurrency', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'PROJECT_ADMIN' });
	});

	// -------------------------------------------------------------------------
	// Happy path
	// -------------------------------------------------------------------------

	it('should succeed and return 200 when the supplied revision matches the stored revision', async () => {
		// sampleTestCaseVersion.revision === 1
		const tc = { ...sampleTestCase, latestVersion: sampleTestCaseVersion };
		mockFindTC.mockResolvedValue(tc);

		const newVersion = { ...sampleTestCaseVersion, id: 101, versionNo: 2, revision: 2 };
		mockSuccessfulTransaction(newVersion);

		const event = createMockEvent({
			method: 'PUT',
			params: PARAMS,
			body: validBody(1), // revision 1 matches stored revision 1
			user: adminUser
		});

		const response = await PUT(event);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.success).toBe(true);
	});

	it('should succeed when the test case has no prior version (first save)', async () => {
		// latestVersion is null — the PUT handler treats missing latestVersion as
		// revision 0, so we pass revision 0 (or any value — the code only checks
		// when latestVersion is truthy).
		const tc = { ...sampleTestCase, latestVersionId: null, latestVersion: null };
		mockFindTC.mockResolvedValue(tc);

		const newVersion = { ...sampleTestCaseVersion, id: 101, versionNo: 1, revision: 1 };
		mockSuccessfulTransaction(newVersion);

		// When latestVersion is null the revision check is skipped entirely.
		const event = createMockEvent({
			method: 'PUT',
			params: PARAMS,
			body: validBody(0),
			user: adminUser
		});

		const response = await PUT(event);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.success).toBe(true);
	});

	// -------------------------------------------------------------------------
	// Conflict — stale revision
	// -------------------------------------------------------------------------

	it('should return 409 when the client sends a stale revision (lower than stored)', async () => {
		const tc = {
			...sampleTestCase,
			latestVersion: { ...sampleTestCaseVersion, revision: 5 }
		};
		mockFindTC.mockResolvedValue(tc);

		const event = createMockEvent({
			method: 'PUT',
			params: PARAMS,
			body: validBody(1), // client thinks revision is 1, but stored is 5
			user: adminUser
		});

		const response = await PUT(event);
		const body = await response.json();

		expect(response.status).toBe(409);
		expect(body.error).toMatch(/modified by another user/i);
	});

	it('should return 409 when the client sends a future revision (higher than stored)', async () => {
		// Any mismatch must be rejected — higher values are equally invalid.
		const tc = {
			...sampleTestCase,
			latestVersion: { ...sampleTestCaseVersion, revision: 3 }
		};
		mockFindTC.mockResolvedValue(tc);

		const event = createMockEvent({
			method: 'PUT',
			params: PARAMS,
			body: validBody(99), // client sends future revision 99, stored is 3
			user: adminUser
		});

		const response = await PUT(event);
		const body = await response.json();

		expect(response.status).toBe(409);
		expect(body.error).toMatch(/modified by another user/i);
	});

	it('should not call db.transaction when there is a revision conflict', async () => {
		const tc = {
			...sampleTestCase,
			latestVersion: { ...sampleTestCaseVersion, revision: 5 }
		};
		mockFindTC.mockResolvedValue(tc);

		const event = createMockEvent({
			method: 'PUT',
			params: PARAMS,
			body: validBody(1),
			user: testUser
		});

		await PUT(event);

		// The write must be aborted — transaction should never be called
		expect(mockDb.transaction).not.toHaveBeenCalled();
	});

	// -------------------------------------------------------------------------
	// Concurrent-edit scenario (two users)
	// -------------------------------------------------------------------------

	it('should reject the second writer when two users save from the same revision', async () => {
		const storedRevision = 3;

		// User A has already incremented the revision to 4 in the DB.
		// User B still holds the old revision 3 and tries to save.
		const tcAfterUserA = {
			...sampleTestCase,
			latestVersion: { ...sampleTestCaseVersion, revision: storedRevision + 1 }
		};
		mockFindTC.mockResolvedValue(tcAfterUserA);

		const eventUserB = createMockEvent({
			method: 'PUT',
			params: PARAMS,
			body: validBody(storedRevision), // user B's stale revision
			user: testUser
		});

		const response = await PUT(eventUserB);

		expect(response.status).toBe(409);
	});

	// -------------------------------------------------------------------------
	// Validation — bad input should fail before the revision check
	// -------------------------------------------------------------------------

	it('should return 400 for an empty title regardless of revision', async () => {
		const event = createMockEvent({
			method: 'PUT',
			params: PARAMS,
			body: validBody(1, { title: '' }),
			user: adminUser
		});

		const response = await PUT(event);

		expect(response.status).toBe(400);
	});

	it('should return 400 for an invalid priority regardless of revision', async () => {
		const event = createMockEvent({
			method: 'PUT',
			params: PARAMS,
			body: validBody(1, { priority: 'URGENT' }),
			user: adminUser
		});

		const response = await PUT(event);

		expect(response.status).toBe(400);
	});

	it('should return 404 when the test case does not exist', async () => {
		mockFindTC.mockResolvedValue(null);

		const event = createMockEvent({
			method: 'PUT',
			params: PARAMS,
			body: validBody(1),
			user: adminUser
		});

		await expect(PUT(event)).rejects.toThrow();
	});
});
