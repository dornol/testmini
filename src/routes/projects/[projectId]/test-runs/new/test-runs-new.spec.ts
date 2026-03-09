import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, sampleTestCase, sampleTestRun } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

const mockRequireAuth = vi.fn();
const mockRequireProjectRole = vi.fn();
const mockLoadProjectTags = vi.fn();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testCase: { id: 'id', projectId: 'project_id', key: 'key', latestVersionId: 'latest_version_id' },
	testCaseVersion: { id: 'id', title: 'title', priority: 'priority' },
	testRun: { id: 'id', projectId: 'project_id', name: 'name', environment: 'environment', createdBy: 'created_by' },
	testExecution: { id: 'id', testRunId: 'test_run_id', testCaseVersionId: 'test_case_version_id' },
	tag: { id: 'id', name: 'name', color: 'color', projectId: 'project_id' },
	testCaseTag: { testCaseId: 'test_case_id', tagId: 'tag_id' },
	testSuite: { id: 'id', name: 'name', projectId: 'project_id' },
	testSuiteItem: { suiteId: 'suite_id', testCaseId: 'test_case_id' },
	testCaseDataSet: { id: 'id', testCaseId: 'test_case_id', orderIndex: 'order_index', values: 'values' }
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
vi.mock('$lib/server/auth-utils', () => ({
	requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
	requireProjectRole: (...args: unknown[]) => mockRequireProjectRole(...args)
}));
vi.mock('$lib/server/queries', () => ({
	loadProjectTags: (...args: unknown[]) => mockLoadProjectTags(...args)
}));

const { load, actions } = await import('./+page.server');

function createFormData(data: Record<string, string | string[]>): FormData {
	const fd = new FormData();
	for (const [key, value] of Object.entries(data)) {
		if (Array.isArray(value)) {
			for (const v of value) {
				fd.append(key, v);
			}
		} else {
			fd.append(key, value);
		}
	}
	return fd;
}

const PROJECT_ID = '1';

describe('/projects/[projectId]/test-runs/new', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireAuth.mockReturnValue(testUser);
		mockRequireProjectRole.mockResolvedValue(undefined);
		mockLoadProjectTags.mockResolvedValue([]);
		// Default: select returns empty arrays
		mockSelectResult(mockDb, []);
	});

	describe('load', () => {
		function createLoadEvent(opts: { userRole?: string; searchParams?: Record<string, string> } = {}) {
			const { userRole = 'QA', searchParams = {} } = opts;
			const event = createMockEvent({
				params: { projectId: PROJECT_ID },
				searchParams
			});
			// The load function calls parent() which returns { userRole }
			(event as Record<string, unknown>).parent = vi.fn().mockResolvedValue({ userRole });
			return event;
		}

		it('should redirect VIEWER role to test-runs list', async () => {
			const event = createLoadEvent({ userRole: 'VIEWER' });
			await expect(load(event)).rejects.toThrow();
		});

		it('should return test cases, project tags, suites, and preselectedIds', async () => {
			const testCasesData = [
				{ id: 10, key: 'TC-0001', title: 'Login test', priority: 'MEDIUM' }
			];
			const tcTagsData = [
				{ testCaseId: 10, tagId: 1, tagName: 'Smoke', tagColor: '#ff0000' }
			];
			const suitesData = [
				{ id: 1, name: 'Smoke Suite', itemCount: 3 }
			];
			const projectTags = [
				{ id: 1, name: 'Smoke', color: '#ff0000' }
			];

			// db.select() is called 3 times: testCases, tcTags, suites
			mockDb.select
				.mockReturnValueOnce(createChain(testCasesData))
				.mockReturnValueOnce(createChain(tcTagsData))
				.mockReturnValueOnce(createChain(suitesData));
			mockLoadProjectTags.mockResolvedValue(projectTags);

			const event = createLoadEvent();
			const result = await load(event) as Record<string, any>;

			expect(result.testCases).toHaveLength(1);
			expect(result.testCases[0]).toMatchObject({
				id: 10,
				key: 'TC-0001',
				title: 'Login test',
				tags: [{ id: 1, name: 'Smoke', color: '#ff0000' }]
			});
			expect(result.projectTags).toEqual(projectTags);
			expect(result.suites).toEqual(suitesData);
			expect(result.preselectedIds).toEqual([]);
		});

		it('should load preselected IDs when suiteId is provided', async () => {
			const testCases = [
				{ id: 10, key: 'TC-0001', title: 'Test 1', priority: 'HIGH' },
				{ id: 11, key: 'TC-0002', title: 'Test 2', priority: 'LOW' }
			];
			const suiteItems = [
				{ testCaseId: 10 },
				{ testCaseId: 11 }
			];

			let selectCallCount = 0;
			mockDb.select.mockImplementation(() => {
				selectCallCount++;
				if (selectCallCount === 1) return createChain(testCases);
				if (selectCallCount === 2) return createChain([]); // tcTags
				if (selectCallCount === 3) return createChain([]); // suites
				return createChain(suiteItems); // suiteItems for preselection
			});
			mockLoadProjectTags.mockResolvedValue([]);

			const event = createLoadEvent({ searchParams: { suiteId: '5' } });
			const result = await load(event) as Record<string, any>;

			expect(result.preselectedIds).toEqual([10, 11]);
		});

		it('should return empty tags when no test cases exist', async () => {
			mockDb.select.mockImplementation(() => createChain([]));
			mockLoadProjectTags.mockResolvedValue([]);

			const event = createLoadEvent();
			const result = await load(event) as Record<string, any>;

			expect(result.testCases).toEqual([]);
			expect(result.preselectedIds).toEqual([]);
		});
	});

	describe('actions.default', () => {
		function createActionEvent(formData: FormData) {
			return createMockEvent({
				method: 'POST',
				params: { projectId: PROJECT_ID },
				formData,
				user: testUser
			});
		}

		it('should return 401 when not authenticated', async () => {
			mockRequireAuth.mockImplementation(() => {
				const err = new Error('Authentication required');
				(err as unknown as Record<string, unknown>).status = 401;
				throw err;
			});

			const event = createActionEvent(
				createFormData({ name: 'Run 1', environment: 'QA', testCaseIds: ['10'] })
			);
			await expect(actions.default(event)).rejects.toThrow('Authentication required');
		});

		it('should return 400 for missing name', async () => {
			const event = createActionEvent(
				createFormData({ environment: 'QA', testCaseIds: ['10'] })
			);
			const result = await actions.default(event);
			expect(result?.status).toBe(400);
			expect(result?.data?.errors).toBeDefined();
		});

		it('should return 400 for empty name', async () => {
			const event = createActionEvent(
				createFormData({ name: '', environment: 'QA', testCaseIds: ['10'] })
			);
			const result = await actions.default(event);
			expect(result?.status).toBe(400);
		});

		it('should return 400 for missing environment', async () => {
			const event = createActionEvent(
				createFormData({ name: 'Run 1', testCaseIds: ['10'] })
			);
			const result = await actions.default(event);
			expect(result?.status).toBe(400);
			expect(result?.data?.errors).toBeDefined();
		});

		it('should return 400 for empty environment', async () => {
			const event = createActionEvent(
				createFormData({ name: 'Run 1', environment: '', testCaseIds: ['10'] })
			);
			const result = await actions.default(event);
			expect(result?.status).toBe(400);
		});

		it('should return 400 for empty testCaseIds', async () => {
			const event = createActionEvent(
				createFormData({ name: 'Run 1', environment: 'QA' })
			);
			const result = await actions.default(event);
			expect(result?.status).toBe(400);
			expect(result?.data?.errors).toBeDefined();
		});

		it('should create test run and redirect on valid input', async () => {
			const createdRun = { ...sampleTestRun, id: 77 };

			// db.select() for selectedCases
			let selectCallCount = 0;
			mockDb.select.mockImplementation(() => {
				selectCallCount++;
				if (selectCallCount === 1) {
					// selectedCases
					return createChain([{ id: 10, latestVersionId: 100 }]);
				}
				// dataSet queries
				return createChain([]);
			});

			setupTransaction(createdRun);

			const event = createActionEvent(
				createFormData({ name: 'Sprint 1', environment: 'QA', testCaseIds: ['10'] })
			);

			try {
				await actions.default(event);
				expect.unreachable('Should have thrown redirect');
			} catch (e: unknown) {
				const err = e as { status: number; location: string };
				expect(err.status).toBe(303);
				expect(err.location).toBe('/projects/1/test-runs/77');
			}

			expect(mockDb.transaction).toHaveBeenCalledOnce();
		});

		it('should create one execution per test case (no data sets)', async () => {
			const createdRun = { ...sampleTestRun, id: 77 };
			const insertedValues: unknown[] = [];

			mockDb.select.mockImplementation(() => {
				return createChain([
					{ id: 10, latestVersionId: 100 },
					{ id: 11, latestVersionId: 101 }
				]);
			});

			// Override default — need second select to return empty data sets
			let dbSelectCount = 0;
			mockDb.select.mockImplementation(() => {
				dbSelectCount++;
				if (dbSelectCount === 1) {
					return createChain([
						{ id: 10, latestVersionId: 100 },
						{ id: 11, latestVersionId: 101 }
					]);
				}
				return createChain([]); // no data sets
			});

			setupTransactionCapture(createdRun, insertedValues);

			const event = createActionEvent(
				createFormData({ name: 'Run', environment: 'DEV', testCaseIds: ['10', '11'] })
			);

			try { await actions.default(event); } catch { /* redirect */ }

			// Find the testExecution insert values
			const execInsert = insertedValues.find(
				(v) => Array.isArray(v) && v.length === 2 && v[0]?.testRunId
			) as Array<{ testRunId: number; testCaseVersionId: number }> | undefined;

			expect(execInsert).toBeDefined();
			expect(execInsert).toHaveLength(2);
			expect(execInsert![0]).toMatchObject({ testRunId: 77, testCaseVersionId: 100 });
			expect(execInsert![1]).toMatchObject({ testRunId: 77, testCaseVersionId: 101 });
		});

		it('should expand executions for test cases with data sets', async () => {
			const createdRun = { ...sampleTestRun, id: 88 };
			const insertedValues: unknown[] = [];

			let dbSelectCount = 0;
			mockDb.select.mockImplementation(() => {
				dbSelectCount++;
				if (dbSelectCount === 1) {
					// selectedCases
					return createChain([{ id: 10, latestVersionId: 100 }]);
				}
				if (dbSelectCount === 2) {
					// first dataSet query (for testCaseIds[0])
					return createChain([
						{ id: 1, testCaseId: 10, orderIndex: 0, values: { username: 'alice' } },
						{ id: 2, testCaseId: 10, orderIndex: 1, values: { username: 'bob' } }
					]);
				}
				// second dataSet query (all data sets ordered by orderIndex)
				return createChain([
					{ id: 1, testCaseId: 10, orderIndex: 0, values: { username: 'alice' } },
					{ id: 2, testCaseId: 10, orderIndex: 1, values: { username: 'bob' } }
				]);
			});

			setupTransactionCapture(createdRun, insertedValues);

			const event = createActionEvent(
				createFormData({ name: 'Param Run', environment: 'QA', testCaseIds: ['10'] })
			);

			try { await actions.default(event); } catch { /* redirect */ }

			// Should have 2 executions (one per data set row)
			const execInsert = insertedValues.find(
				(v) => Array.isArray(v) && v.length > 0 && v[0]?.testRunId && v[0]?.dataSetId
			) as Array<{ testRunId: number; testCaseVersionId: number; dataSetId: number; parameterValues: Record<string, string> }> | undefined;

			expect(execInsert).toBeDefined();
			expect(execInsert).toHaveLength(2);
			expect(execInsert![0]).toMatchObject({
				testRunId: 88,
				testCaseVersionId: 100,
				dataSetId: 1,
				parameterValues: { username: 'alice' }
			});
			expect(execInsert![1]).toMatchObject({
				testRunId: 88,
				testCaseVersionId: 100,
				dataSetId: 2,
				parameterValues: { username: 'bob' }
			});
		});

		it('should skip test cases with no matching version', async () => {
			const createdRun = { ...sampleTestRun, id: 99 };
			const insertedValues: unknown[] = [];

			mockDb.select.mockImplementation(() => {
				// Return selected cases that don't include ID 999
				return createChain([{ id: 10, latestVersionId: 100 }]);
			});

			setupTransactionCapture(createdRun, insertedValues);

			const event = createActionEvent(
				createFormData({ name: 'Run', environment: 'QA', testCaseIds: ['10', '999'] })
			);

			try { await actions.default(event); } catch { /* redirect */ }

			// Only 1 execution should be created (for ID 10), 999 has no version
			const execInsert = insertedValues.find(
				(v) => Array.isArray(v) && v.length > 0 && v[0]?.testRunId
			) as Array<{ testCaseVersionId: number }> | undefined;

			expect(execInsert).toBeDefined();
			expect(execInsert).toHaveLength(1);
			expect(execInsert![0].testCaseVersionId).toBe(100);
		});

		it('should not insert executions if no valid test case IDs match', async () => {
			const createdRun = { ...sampleTestRun, id: 99 };

			// No matching cases in the project
			mockDb.select.mockImplementation(() => createChain([]));

			let txInsertCallCount = 0;
			mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txInsertChain = {
					values: vi.fn().mockImplementation(function (this: typeof txInsertChain) {
						txInsertCallCount++;
						return txInsertChain;
					}),
					returning: vi.fn().mockResolvedValue([createdRun]),
					then: undefined as unknown
				};
				txInsertChain.then = (r: (v: unknown) => void) =>
					Promise.resolve([createdRun]).then(r);

				const tx = {
					insert: vi.fn().mockReturnValue(txInsertChain)
				};
				return fn(tx);
			});

			const event = createActionEvent(
				createFormData({ name: 'Run', environment: 'QA', testCaseIds: ['999'] })
			);

			try { await actions.default(event); } catch { /* redirect */ }

			// Only 1 insert call (testRun), no testExecution insert
			expect(txInsertCallCount).toBe(1);
		});

		it('should return validation errors in the fail response', async () => {
			const event = createActionEvent(
				createFormData({ name: '', environment: '', testCaseIds: [] })
			);
			const result = await actions.default(event);
			expect(result?.status).toBe(400);
			expect(result?.data?.errors).toBeDefined();
			// Should have errors for name and environment
			expect(result?.data?.errors?.name).toBeDefined();
			expect(result?.data?.errors?.environment).toBeDefined();
		});

		it('should pass form values back in fail response', async () => {
			const event = createActionEvent(
				createFormData({ name: '', environment: 'QA', testCaseIds: ['10'] })
			);
			const result = await actions.default(event);
			expect(result?.status).toBe(400);
			expect(result?.data?.environment).toBe('QA');
		});

		it('should call requireAuth and requireProjectRole', async () => {
			const createdRun = { ...sampleTestRun, id: 55 };
			mockDb.select.mockImplementation(() => createChain([{ id: 10, latestVersionId: 100 }]));
			setupTransaction(createdRun);

			const event = createActionEvent(
				createFormData({ name: 'Run', environment: 'QA', testCaseIds: ['10'] })
			);

			try { await actions.default(event); } catch { /* redirect */ }

			expect(mockRequireAuth).toHaveBeenCalledWith((event as any).locals);
			expect(mockRequireProjectRole).toHaveBeenCalledWith(testUser, 1, ['PROJECT_ADMIN', 'QA', 'DEV']);
		});
	});
});


// --- Helpers ---

function createChain(result: unknown[]) {
	const chain: Record<string, unknown> = {};
	const methods = ['from', 'where', 'orderBy', 'limit', 'offset', 'innerJoin', 'leftJoin', 'groupBy', 'as', 'set', 'values', 'returning', 'onConflictDoNothing', 'onConflictDoUpdate'];
	for (const m of methods) {
		chain[m] = vi.fn().mockImplementation(() => chain);
	}
	chain.then = (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve);
	return chain;
}

function setupTransaction(createdRun: typeof sampleTestRun) {
	mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
		const txInsertChain = {
			values: vi.fn().mockReturnThis(),
			returning: vi.fn().mockResolvedValue([createdRun]),
			then: undefined as unknown
		};
		txInsertChain.then = (r: (v: unknown) => void) =>
			Promise.resolve([createdRun]).then(r);

		const tx = {
			insert: vi.fn().mockReturnValue(txInsertChain)
		};
		return fn(tx);
	});
}

function setupTransactionCapture(
	createdRun: typeof sampleTestRun,
	insertedValues: unknown[]
) {
	mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
		const txInsertChain = {
			values: vi.fn().mockImplementation(function (this: typeof txInsertChain, vals: unknown) {
				insertedValues.push(vals);
				return txInsertChain;
			}),
			returning: vi.fn().mockResolvedValue([createdRun]),
			then: undefined as unknown
		};
		txInsertChain.then = (r: (v: unknown) => void) =>
			Promise.resolve([createdRun]).then(r);

		const tx = {
			insert: vi.fn().mockReturnValue(txInsertChain)
		};
		return fn(tx);
	});
}
