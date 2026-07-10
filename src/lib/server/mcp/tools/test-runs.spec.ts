import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	createMockDb,
	mockDeleteReturning,
	mockSelectResult,
	mockInsertReturning,
	mockUpdateReturning
} from '$lib/server/test-helpers/mock-db';
import { sampleProject, sampleTestRun, sampleExecution } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({
	db: mockDb
}));
vi.mock('$lib/server/db/schema', () => ({
	project: { id: 'id', createdBy: 'created_by' },
	testCase: { id: 'id', projectId: 'project_id', key: 'key', latestVersionId: 'latest_version_id' },
	testCaseVersion: { id: 'id', testCaseId: 'test_case_id', title: 'title', priority: 'priority' },
	testRun: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		environment: 'environment',
		status: 'status',
		createdBy: 'created_by',
		createdAt: 'created_at',
		finishedAt: 'finished_at'
	},
	testExecution: {
		id: 'id',
		testRunId: 'test_run_id',
		testCaseVersionId: 'test_case_version_id',
		status: 'status',
		executedAt: 'executed_at'
	},
	testFailureDetail: {
		id: 'id',
		testExecutionId: 'test_execution_id',
		errorMessage: 'error_message',
		stackTrace: 'stack_trace',
		failureEnvironment: 'failure_environment',
		comment: 'comment',
		createdBy: 'created_by'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	desc: vi.fn((a: unknown) => a),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
		{ raw: (s: string) => s }
	),
	inArray: vi.fn((a: unknown, b: unknown) => [a, b])
}));

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const { registerTestRunTools } = await import('./test-runs');

const PROJECT_ID = 1;

type ContentArray = Array<{ type: string; text: string }>;
function parseResult(result: unknown) {
	const toolResult = result as { content?: unknown };
	return JSON.parse(((result as { content?: unknown }).content as ContentArray)[0].text);
}

async function createClient() {
	const server = new McpServer({ name: 'test', version: '1.0.0' });
	registerTestRunTools(server, PROJECT_ID);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: 'test-client', version: '1.0.0' });
	await client.connect(clientTransport);
	return { client, close: () => clientTransport.close() };
}

describe('MCP test-run tools', () => {
	let client: Client;
	let close: () => Promise<void>;

	beforeEach(async () => {
		vi.clearAllMocks();
		const c = await createClient();
		client = c.client;
		close = c.close;
	});

	afterEach(async () => {
		await close();
	});

	// ── list-test-runs ───────────────────────────────────

	describe('list-test-runs', () => {
		it('should reject invalid limits before querying', async () => {
			const result = await client.callTool({
				name: 'list-test-runs',
				arguments: { limit: 0 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toContain(
				'Too small'
			);
			expect(mockDb.select).not.toHaveBeenCalled();
		});
	});

	// ── get-test-run ─────────────────────────────────────

	describe('get-test-run', () => {
		it('should return run with executions and status counts', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			const selectChain = mockSelectResult(mockDb, [
				{
					id: 200,
					status: 'PASS',
					executedAt: '2025-01-02',
					testCaseKey: 'TC-0001',
					testCaseTitle: 'Login'
				},
				{
					id: 201,
					status: 'FAIL',
					executedAt: '2025-01-02',
					testCaseKey: 'TC-0002',
					testCaseTitle: 'Signup'
				}
			]);

			const result = await client.callTool({ name: 'get-test-run', arguments: { runId: 50 } });

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('Sprint 1 Run');
			expect(parsed.statusCounts.PASS).toBe(1);
			expect(parsed.statusCounts.FAIL).toBe(1);
			expect(parsed.executions).toHaveLength(2);
			expect(selectChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['test_run_id', 50],
					['project_id', PROJECT_ID]
				])
			);
		});

		it('should return error when run not found', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(null);

			const result = await client.callTool({ name: 'get-test-run', arguments: { runId: 999 } });

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Test run not found'
			);
		});
	});

	// ── get-failures ─────────────────────────────────────

	describe('get-failures', () => {
		it('should return failure details', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			const selectChain = mockSelectResult(mockDb, [
				{
					executionId: 200,
					testCaseKey: 'TC-0001',
					testCaseTitle: 'Login',
					errorMessage: 'Timeout',
					stackTrace: 'at line 1',
					failureEnvironment: 'Chrome',
					comment: null
				}
			]);

			const result = await client.callTool({ name: 'get-failures', arguments: { runId: 50 } });

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed).toHaveLength(1);
			expect(parsed[0].errorMessage).toBe('Timeout');
			expect(selectChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['test_run_id', 50],
					['project_id', PROJECT_ID]
				])
			);
		});

		it('should return error when run not found', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(null);

			const result = await client.callTool({ name: 'get-failures', arguments: { runId: 999 } });

			expect(result.isError).toBe(true);
		});
	});

	// ── create-test-run ──────────────────────────────────

	describe('create-test-run', () => {
		it('should create a run with all test cases when no IDs specified', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockSelectResult(mockDb, [
				{ id: 10, latestVersionId: 100 },
				{ id: 11, latestVersionId: 101 }
			]);

			const createdRun = {
				id: 60,
				projectId: 1,
				name: 'New Run',
				environment: 'QA',
				createdBy: 'user-1'
			};
			mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				let insertCallCount = 0;
				const tx = {
					insert: vi.fn().mockImplementation(() => {
						insertCallCount++;
						const chain = {
							values: vi.fn().mockReturnThis(),
							returning: vi.fn().mockReturnThis(),
							then: (resolve: (v: unknown) => void) => {
								return Promise.resolve(
									insertCallCount === 1 ? [createdRun] : [{ id: 1 }, { id: 2 }]
								).then(resolve);
							}
						};
						return chain;
					})
				};
				return fn(tx);
			});

			const result = await client.callTool({
				name: 'create-test-run',
				arguments: { name: ' New Run ', environment: ' QA ' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('New Run');
			expect(parsed.executionCount).toBe(2);
		});

		it('should return error when test run insert creates no row', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockSelectResult(mockDb, [{ id: 10, latestVersionId: 100 }]);
			mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const tx = {
					insert: vi.fn().mockReturnValue({
						values: vi.fn().mockReturnThis(),
						returning: vi.fn().mockReturnThis(),
						then: (resolve: (v: unknown) => void) => Promise.resolve([]).then(resolve)
					})
				};
				return fn(tx);
			});

			const result = await client.callTool({
				name: 'create-test-run',
				arguments: { name: 'Run', environment: 'QA' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Failed to create test run'
			);
		});

		it('should return error when execution insert creates fewer rows than requested', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockSelectResult(mockDb, [
				{ id: 10, latestVersionId: 100 },
				{ id: 11, latestVersionId: 101 }
			]);
			const createdRun = {
				id: 60,
				projectId: 1,
				name: 'Run',
				environment: 'QA',
				createdBy: 'user-1'
			};
			mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				let insertCallCount = 0;
				const tx = {
					insert: vi.fn().mockImplementation(() => {
						insertCallCount++;
						return {
							values: vi.fn().mockReturnThis(),
							returning: vi.fn().mockReturnThis(),
							then: (resolve: (v: unknown) => void) =>
								Promise.resolve(insertCallCount === 1 ? [createdRun] : [{ id: 1 }]).then(resolve)
						};
					})
				};
				return fn(tx);
			});

			const result = await client.callTool({
				name: 'create-test-run',
				arguments: { name: 'Run', environment: 'QA' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Failed to create all test run executions'
			);
		});

		it('should reject blank names before project lookup', async () => {
			const result = await client.callTool({
				name: 'create-test-run',
				arguments: { name: '   ', environment: 'QA' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Name is required'
			);
			expect(mockDb.query.project.findFirst).not.toHaveBeenCalled();
			expect(mockDb.transaction).not.toHaveBeenCalled();
		});

		it('should reject blank environments before project lookup', async () => {
			const result = await client.callTool({
				name: 'create-test-run',
				arguments: { name: 'Run', environment: '   ' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Environment is required'
			);
			expect(mockDb.query.project.findFirst).not.toHaveBeenCalled();
			expect(mockDb.transaction).not.toHaveBeenCalled();
		});

		it('should return error when project not found', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'create-test-run',
				arguments: { name: 'Run', environment: 'QA' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Project not found'
			);
		});

		it('should return error when no test cases found', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockSelectResult(mockDb, []);

			const result = await client.callTool({
				name: 'create-test-run',
				arguments: { name: 'Run', environment: 'QA' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'No test cases found'
			);
		});
	});

	// ── record-failure-detail ────────────────────────────

	describe('record-failure-detail', () => {
		it('should record failure detail', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			mockDb.query.testExecution.findFirst.mockResolvedValue(sampleExecution);
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockInsertReturning(mockDb, [
				{
					id: 1,
					testExecutionId: 200,
					errorMessage: 'Err',
					stackTrace: null,
					failureEnvironment: null,
					comment: null,
					createdBy: 'user-1'
				}
			]);

			const result = await client.callTool({
				name: 'record-failure-detail',
				arguments: { runId: 50, executionId: 200, errorMessage: 'Err' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.errorMessage).toBe('Err');
		});

		it('should return error when run not found', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'record-failure-detail',
				arguments: { runId: 999, executionId: 200 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Test run not found'
			);
		});

		it('should return error when execution not found', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			mockDb.query.testExecution.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'record-failure-detail',
				arguments: { runId: 50, executionId: 999 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Execution not found'
			);
		});

		it('should return error when failure detail insert returns no row', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			mockDb.query.testExecution.findFirst.mockResolvedValue(sampleExecution);
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockInsertReturning(mockDb, []);

			const result = await client.callTool({
				name: 'record-failure-detail',
				arguments: { runId: 50, executionId: 200, errorMessage: 'Err' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Failed to record failure detail'
			);
		});
	});

	// ── update-execution-status ──────────────────────────

	describe('update-execution-status', () => {
		it('should update execution status', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			mockDb.query.testExecution.findFirst.mockResolvedValue(sampleExecution);

			const result = await client.callTool({
				name: 'update-execution-status',
				arguments: { runId: 50, executionId: 200, status: 'PASS' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.status).toBe('PASS');
			expect(mockDb._chains.update.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 200],
					['test_run_id', 50]
				])
			);
		});

		it('should reject update on completed run', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue({ ...sampleTestRun, status: 'COMPLETED' });

			const result = await client.callTool({
				name: 'update-execution-status',
				arguments: { runId: 50, executionId: 200, status: 'PASS' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Cannot modify completed run'
			);
		});

		it('should return error when execution not found', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			mockDb.query.testExecution.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'update-execution-status',
				arguments: { runId: 50, executionId: 999, status: 'PASS' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Execution not found'
			);
		});
	});

	// ── bulk-update-execution-status ─────────────────────

	describe('bulk-update-execution-status', () => {
		it('should reject unknown update fields before run lookup', async () => {
			const result = await client.callTool({
				name: 'bulk-update-execution-status',
				arguments: {
					runId: 50,
					updates: [{ executionId: 200, status: 'PASS', comment: 'extra' }]
				}
			});

			expect(result.isError).toBe(true);
			expect(mockDb.query.testRun.findFirst).not.toHaveBeenCalled();
			expect(mockDb.select).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});
	});

	// ── complete-test-run ────────────────────────────────

	describe('complete-test-run', () => {
		it('should complete a run', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);

			const result = await client.callTool({ name: 'complete-test-run', arguments: { runId: 50 } });

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.status).toBe('COMPLETED');
			expect(mockDb._chains.update.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 50],
					['project_id', PROJECT_ID]
				])
			);
		});

		it('should reject completing an already completed run', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue({ ...sampleTestRun, status: 'COMPLETED' });

			const result = await client.callTool({ name: 'complete-test-run', arguments: { runId: 50 } });

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Test run already completed'
			);
		});

		it('should return error when run not found', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'complete-test-run',
				arguments: { runId: 999 }
			});

			expect(result.isError).toBe(true);
		});
	});

	// ── update-test-run ─────────────────────────────────

	describe('update-test-run', () => {
		it('should update a test run', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			const updateChain = mockUpdateReturning(mockDb, [
				{ ...sampleTestRun, name: 'Updated Run', environment: 'PROD' }
			]);

			const result = await client.callTool({
				name: 'update-test-run',
				arguments: { runId: 50, name: ' Updated Run ', environment: ' PROD ' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('Updated Run');
			expect(parsed.environment).toBe('PROD');
			expect(updateChain.set).toHaveBeenCalledWith({ name: 'Updated Run', environment: 'PROD' });
			expect(updateChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 50],
					['project_id', PROJECT_ID]
				])
			);
		});

		it('should reject empty updates before run lookup', async () => {
			const result = await client.callTool({
				name: 'update-test-run',
				arguments: { runId: 50 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'No fields to update'
			);
			expect(mockDb.query.testRun.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should reject blank update names before run lookup', async () => {
			const result = await client.callTool({
				name: 'update-test-run',
				arguments: { runId: 50, name: '   ' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Name is required'
			);
			expect(mockDb.query.testRun.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should return error when run not found', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'update-test-run',
				arguments: { runId: 999, name: 'Updated' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Test run not found'
			);
		});

		it('should return error when run disappears before update', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			mockUpdateReturning(mockDb, []);

			const result = await client.callTool({
				name: 'update-test-run',
				arguments: { runId: 50, name: 'Updated' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Test run not found'
			);
		});
	});

	// ── delete-test-run ─────────────────────────────────

	describe('delete-test-run', () => {
		it('should delete a test run', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			const deleteChain = mockDeleteReturning(mockDb, [sampleTestRun]);

			const result = await client.callTool({
				name: 'delete-test-run',
				arguments: { runId: 50 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.deletedId).toBe(50);
			expect(mockDb.delete).toHaveBeenCalledTimes(1);
			expect(deleteChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 50],
					['project_id', PROJECT_ID]
				])
			);
			expect(deleteChain.returning).toHaveBeenCalledTimes(1);
		});

		it('should return error when run not found', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'delete-test-run',
				arguments: { runId: 999 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Test run not found'
			);
		});

		it('should return error when delete affects no test run', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			mockDeleteReturning(mockDb, []);

			const result = await client.callTool({
				name: 'delete-test-run',
				arguments: { runId: 50 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Test run not found'
			);
		});
	});

	// ── export-run-results ───────────────────────────────

	describe('export-run-results', () => {
		it('should export run results with failure details', async () => {
			const run = {
				...sampleTestRun,
				id: 50,
				name: 'Sprint 1',
				environment: 'QA',
				status: 'COMPLETED',
				createdAt: '2025-01-01',
				finishedAt: '2025-01-05'
			};
			mockDb.query.testRun.findFirst.mockResolvedValue(run);

			let selectCallCount = 0;
			const executionsWhere = vi.fn().mockReturnThis();
			const failuresWhere = vi.fn().mockReturnThis();
			mockDb.select.mockImplementation(() => {
				selectCallCount++;
				const data =
					selectCallCount === 1
						? [
								{
									executionId: 200,
									status: 'FAIL',
									executedAt: '2025-01-02',
									testCaseKey: 'TC-0001',
									testCaseTitle: 'Login',
									priority: 'HIGH'
								}
							]
						: [
								{
									executionId: 200,
									errorMessage: 'Timeout',
									stackTrace: null,
									failureEnvironment: null,
									comment: null
								}
							];
				const chain = {
					from: vi.fn().mockReturnThis(),
					innerJoin: vi.fn().mockReturnThis(),
					where: selectCallCount === 1 ? executionsWhere : failuresWhere,
					then: (resolve: (v: unknown) => void) => Promise.resolve(data).then(resolve)
				};
				return chain as never;
			});

			const result = await client.callTool({
				name: 'export-run-results',
				arguments: { runId: 50 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.run.name).toBe('Sprint 1');
			expect(parsed.statusCounts.FAIL).toBe(1);
			expect(parsed.totalExecutions).toBe(1);
			expect(parsed.results[0].failures).toHaveLength(1);
			expect(executionsWhere).toHaveBeenCalledWith(
				expect.arrayContaining([
					['test_run_id', 50],
					['project_id', PROJECT_ID]
				])
			);
			expect(failuresWhere).toHaveBeenCalledWith(
				expect.arrayContaining([
					['test_run_id', 50],
					['project_id', PROJECT_ID]
				])
			);
		});

		it('should return error when run not found', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'export-run-results',
				arguments: { runId: 999 }
			});

			expect(result.isError).toBe(true);
		});
	});
});
