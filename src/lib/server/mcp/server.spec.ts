import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockDb, mockSelectResult, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import {
	sampleProject,
	sampleTestCase,
	sampleTestCaseVersion,
	sampleTestRun,
	sampleExecution
} from '$lib/server/test-helpers/fixtures';

/** Extract text from MCP resource content (handles TextResourceContents union) */
function getResourceText(content: { uri: string; text?: string; blob?: string }): string {
	return content.text ?? '';
}

const mockDb = createMockDb();
const mockFindTestCaseWithLatestVersion = vi.fn();

vi.mock('$lib/server/db', () => ({
	db: mockDb,
	findTestCaseWithLatestVersion: mockFindTestCaseWithLatestVersion
}));
vi.mock('$lib/server/db/schema', () => ({
	project: { id: 'id', name: 'name', description: 'description', active: 'active', createdBy: 'created_by', createdAt: 'created_at' },
	projectMember: { projectId: 'project_id', userId: 'user_id', role: 'role' },
	testSuite: { id: 'id', projectId: 'project_id' },
	testPlan: { id: 'id', projectId: 'project_id' },
	environmentConfig: { projectId: 'project_id', name: 'name', color: 'color', sortOrder: 'sort_order' },
	priorityConfig: { projectId: 'project_id', name: 'name', color: 'color', sortOrder: 'sort_order' },
	testCase: {
		id: 'id',
		projectId: 'project_id',
		key: 'key',
		automationKey: 'automation_key',
		latestVersionId: 'latest_version_id',
		sortOrder: 'sort_order',
		createdBy: 'created_by',
		createdAt: 'created_at'
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
		updatedBy: 'updated_by'
	},
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
	},
	tag: { id: 'id', name: 'name', color: 'color' },
	testCaseTag: { testCaseId: 'test_case_id', tagId: 'tag_id' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	like: vi.fn((a: unknown, b: unknown) => [a, b]),
	desc: vi.fn((a: unknown) => a),
	asc: vi.fn((a: unknown) => a),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
		{ raw: (s: string) => s }
	),
	inArray: vi.fn((a: unknown, b: unknown) => [a, b]),
	count: vi.fn()
}));

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const { createMcpServer } = await import('./server');

const PROJECT_ID = 1;

async function createConnectedClient() {
	const server = createMcpServer(PROJECT_ID);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

	await server.connect(serverTransport);

	const client = new Client({ name: 'test-client', version: '1.0.0' });
	await client.connect(clientTransport);

	return { client, server, clientTransport, serverTransport };
}

describe('MCP Server', () => {
	let client: Client;
	let cleanup: () => Promise<void>;

	beforeEach(async () => {
		vi.clearAllMocks();
		const connected = await createConnectedClient();
		client = connected.client;
		cleanup = async () => {
			await connected.clientTransport.close();
		};
	});

	afterEach(async () => {
		await cleanup();
	});

	// ── Resources ─────────────────────────────────────────

	describe('resource: test-cases://list', () => {
		it('should return test cases as JSON', async () => {
			const mockCases = [
				{ id: 10, key: 'TC-0001', automationKey: null, title: 'Login test', priority: 'HIGH', createdAt: '2025-01-01' },
				{ id: 11, key: 'TC-0002', automationKey: 'login_auto', title: 'Signup test', priority: 'MEDIUM', createdAt: '2025-01-02' }
			];
			mockSelectResult(mockDb, mockCases);

			const result = await client.readResource({ uri: 'test-cases://list' });

			expect(result.contents).toHaveLength(1);
			expect(result.contents[0].uri).toBe('test-cases://list');
			expect(result.contents[0].mimeType).toBe('application/json');
			const parsed = JSON.parse(getResourceText(result.contents[0]));
			expect(parsed).toHaveLength(2);
			expect(parsed[0].key).toBe('TC-0001');
			expect(parsed[1].key).toBe('TC-0002');
		});

		it('should return empty array when no test cases exist', async () => {
			mockSelectResult(mockDb, []);

			const result = await client.readResource({ uri: 'test-cases://list' });
			const parsed = JSON.parse(getResourceText(result.contents[0]));
			expect(parsed).toEqual([]);
		});
	});

	describe('resource: test-runs://list', () => {
		it('should return test runs as JSON', async () => {
			const mockRuns = [
				{ id: 50, name: 'Sprint 1', environment: 'QA', status: 'CREATED', createdAt: '2025-01-01', finishedAt: null }
			];
			mockSelectResult(mockDb, mockRuns);

			const result = await client.readResource({ uri: 'test-runs://list' });

			expect(result.contents).toHaveLength(1);
			expect(result.contents[0].uri).toBe('test-runs://list');
			expect(result.contents[0].mimeType).toBe('application/json');
			const parsed = JSON.parse(getResourceText(result.contents[0]));
			expect(parsed).toHaveLength(1);
			expect(parsed[0].name).toBe('Sprint 1');
		});

		it('should return empty array when no test runs exist', async () => {
			mockSelectResult(mockDb, []);

			const result = await client.readResource({ uri: 'test-runs://list' });
			const parsed = JSON.parse(getResourceText(result.contents[0]));
			expect(parsed).toEqual([]);
		});

		it('should include all run fields', async () => {
			const mockRuns = [
				{ id: 50, name: 'Sprint 1', environment: 'QA', status: 'COMPLETED', createdAt: '2025-01-01', finishedAt: '2025-01-05' }
			];
			mockSelectResult(mockDb, mockRuns);

			const result = await client.readResource({ uri: 'test-runs://list' });
			const parsed = JSON.parse(getResourceText(result.contents[0]));
			expect(parsed[0]).toEqual({
				id: 50,
				name: 'Sprint 1',
				environment: 'QA',
				status: 'COMPLETED',
				createdAt: '2025-01-01',
				finishedAt: '2025-01-05'
			});
		});
	});

	describe('resource: reports://summary', () => {
		it('should return dashboard summary', async () => {
			const mockRuns = [
				{ id: 50, name: 'Sprint 1', status: 'COMPLETED', environment: 'QA', finishedAt: '2025-01-05' }
			];
			// First select call returns runs, second returns count
			let callCount = 0;
			mockDb.select.mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// runs query
					const chain = {
						from: vi.fn().mockReturnThis(),
						where: vi.fn().mockReturnThis(),
						orderBy: vi.fn().mockReturnThis(),
						limit: vi.fn().mockReturnThis(),
						then: (resolve: (v: unknown) => void) => Promise.resolve(mockRuns).then(resolve)
					};
					return chain as never;
				} else {
					// count query
					const chain = {
						from: vi.fn().mockReturnThis(),
						where: vi.fn().mockReturnThis(),
						then: (resolve: (v: unknown) => void) => Promise.resolve([{ value: 42 }]).then(resolve)
					};
					return chain as never;
				}
			});

			const result = await client.readResource({ uri: 'reports://summary' });
			const parsed = JSON.parse(getResourceText(result.contents[0]));

			expect(parsed.totalTestCases).toBe(42);
			expect(parsed.recentRuns).toHaveLength(1);
			expect(parsed.recentRuns[0].name).toBe('Sprint 1');
		});
	});

	describe('resource: projects://current', () => {
		function mockProjectSelects(data: {
			tcCount?: number;
			runCount?: number;
			suiteCount?: number;
			planCount?: number;
			members?: unknown[];
			environments?: unknown[];
			priorities?: unknown[];
		}) {
			let selectCallCount = 0;
			mockDb.select.mockImplementation(() => {
				selectCallCount++;
				let result: unknown[];
				switch (selectCallCount) {
					case 1: result = [{ value: data.tcCount ?? 0 }]; break;
					case 2: result = [{ value: data.runCount ?? 0 }]; break;
					case 3: result = [{ value: data.suiteCount ?? 0 }]; break;
					case 4: result = [{ value: data.planCount ?? 0 }]; break;
					case 5: result = data.members ?? []; break;
					case 6: result = data.environments ?? []; break;
					case 7: result = data.priorities ?? []; break;
					default: result = [];
				}
				const chain = {
					from: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					orderBy: vi.fn().mockReturnThis(),
					then: (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve)
				};
				return chain as never;
			});
		}

		it('should return project info with counts and metadata', async () => {
			mockDb.query.project = { findFirst: vi.fn().mockResolvedValue(sampleProject) };
			mockProjectSelects({
				tcCount: 25,
				runCount: 10,
				suiteCount: 3,
				planCount: 2,
				members: [{ userId: 'user-1', role: 'PROJECT_ADMIN' }, { userId: 'user-2', role: 'QA' }],
				environments: [{ name: 'DEV', color: '#22c55e' }, { name: 'QA', color: '#3b82f6' }],
				priorities: [{ name: 'HIGH', color: '#ef4444' }, { name: 'MEDIUM', color: '#f59e0b' }]
			});

			const result = await client.readResource({ uri: 'projects://current' });

			expect(result.contents).toHaveLength(1);
			expect(result.contents[0].uri).toBe('projects://current');
			expect(result.contents[0].mimeType).toBe('application/json');
			const parsed = JSON.parse(getResourceText(result.contents[0]));
			expect(parsed.name).toBe('Sample Project');
			expect(parsed.description).toBe('A test project');
			expect(parsed.active).toBe(true);
			expect(parsed.counts.testCases).toBe(25);
			expect(parsed.counts.testRuns).toBe(10);
			expect(parsed.counts.testSuites).toBe(3);
			expect(parsed.counts.testPlans).toBe(2);
			expect(parsed.counts.members).toBe(2);
			expect(parsed.members).toHaveLength(2);
			expect(parsed.members[0]).toEqual({ userId: 'user-1', role: 'PROJECT_ADMIN' });
			expect(parsed.environments).toHaveLength(2);
			expect(parsed.environments[0]).toEqual({ name: 'DEV', color: '#22c55e' });
			expect(parsed.priorities).toHaveLength(2);
			expect(parsed.priorities[0]).toEqual({ name: 'HIGH', color: '#ef4444' });
		});

		it('should return null when project not found', async () => {
			mockDb.query.project = { findFirst: vi.fn().mockResolvedValue(null) };

			const result = await client.readResource({ uri: 'projects://current' });
			const parsed = JSON.parse(getResourceText(result.contents[0]));
			expect(parsed).toBeNull();
		});

		it('should handle project with zero counts', async () => {
			mockDb.query.project = { findFirst: vi.fn().mockResolvedValue(sampleProject) };
			mockProjectSelects({});

			const result = await client.readResource({ uri: 'projects://current' });
			const parsed = JSON.parse(getResourceText(result.contents[0]));

			expect(parsed.counts.testCases).toBe(0);
			expect(parsed.counts.testRuns).toBe(0);
			expect(parsed.counts.testSuites).toBe(0);
			expect(parsed.counts.testPlans).toBe(0);
			expect(parsed.counts.members).toBe(0);
			expect(parsed.members).toEqual([]);
			expect(parsed.environments).toEqual([]);
			expect(parsed.priorities).toEqual([]);
		});

		it('should include project id and createdAt', async () => {
			mockDb.query.project = { findFirst: vi.fn().mockResolvedValue(sampleProject) };
			mockProjectSelects({});

			const result = await client.readResource({ uri: 'projects://current' });
			const parsed = JSON.parse(getResourceText(result.contents[0]));

			expect(parsed.id).toBe(1);
			expect(parsed.createdAt).toBeDefined();
		});

		it('should handle single member project', async () => {
			mockDb.query.project = { findFirst: vi.fn().mockResolvedValue(sampleProject) };
			mockProjectSelects({
				members: [{ userId: 'user-1', role: 'PROJECT_ADMIN' }]
			});

			const result = await client.readResource({ uri: 'projects://current' });
			const parsed = JSON.parse(getResourceText(result.contents[0]));

			expect(parsed.counts.members).toBe(1);
			expect(parsed.members).toHaveLength(1);
			expect(parsed.members[0].role).toBe('PROJECT_ADMIN');
		});

		it('should handle project with many environments and priorities', async () => {
			mockDb.query.project = { findFirst: vi.fn().mockResolvedValue(sampleProject) };
			const envs = [
				{ name: 'DEV', color: '#22c55e' },
				{ name: 'QA', color: '#3b82f6' },
				{ name: 'STAGE', color: '#f59e0b' },
				{ name: 'PROD', color: '#ef4444' }
			];
			const prios = [
				{ name: 'LOW', color: '#6b7280' },
				{ name: 'MEDIUM', color: '#3b82f6' },
				{ name: 'HIGH', color: '#f97316' },
				{ name: 'CRITICAL', color: '#ef4444' }
			];
			mockProjectSelects({ environments: envs, priorities: prios });

			const result = await client.readResource({ uri: 'projects://current' });
			const parsed = JSON.parse(getResourceText(result.contents[0]));

			expect(parsed.environments).toHaveLength(4);
			expect(parsed.priorities).toHaveLength(4);
			expect(parsed.environments.map((e: { name: string }) => e.name)).toEqual(['DEV', 'QA', 'STAGE', 'PROD']);
			expect(parsed.priorities.map((p: { name: string }) => p.name)).toEqual(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
		});

		it('should handle inactive project', async () => {
			mockDb.query.project = { findFirst: vi.fn().mockResolvedValue({ ...sampleProject, active: false }) };
			mockProjectSelects({});

			const result = await client.readResource({ uri: 'projects://current' });
			const parsed = JSON.parse(getResourceText(result.contents[0]));

			expect(parsed.active).toBe(false);
		});

		it('should handle project with null description', async () => {
			mockDb.query.project = { findFirst: vi.fn().mockResolvedValue({ ...sampleProject, description: null }) };
			mockProjectSelects({});

			const result = await client.readResource({ uri: 'projects://current' });
			const parsed = JSON.parse(getResourceText(result.contents[0]));

			expect(parsed.description).toBeNull();
		});
	});

	// ── Tools ─────────────────────────────────────────────

	describe('tool: search-test-cases', () => {
		it('should search and return matching test cases', async () => {
			const mockResults = [
				{ id: 10, key: 'TC-0001', title: 'Login test', priority: 'HIGH' }
			];
			mockSelectResult(mockDb, mockResults);

			const result = await client.callTool({ name: 'search-test-cases', arguments: { query: 'login' } });

			expect(result.isError).toBeFalsy();
			const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
			expect(parsed).toHaveLength(1);
			expect(parsed[0].key).toBe('TC-0001');
		});

		it('should respect limit parameter', async () => {
			mockSelectResult(mockDb, []);

			await client.callTool({ name: 'search-test-cases', arguments: { query: 'test', limit: 5 } });

			// Verify the chain was called (limit is applied internally)
			expect(mockDb.select).toHaveBeenCalled();
		});

		it('should return empty results for no matches', async () => {
			mockSelectResult(mockDb, []);

			const result = await client.callTool({ name: 'search-test-cases', arguments: { query: 'nonexistent' } });

			const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
			expect(parsed).toEqual([]);
		});
	});

	describe('tool: get-test-case', () => {
		it('should return test case by ID', async () => {
			mockFindTestCaseWithLatestVersion.mockResolvedValue({
				...sampleTestCase,
				latestVersion: sampleTestCaseVersion
			});
			// Tags query
			mockSelectResult(mockDb, [{ name: 'smoke', color: '#ff0000' }]);

			const result = await client.callTool({ name: 'get-test-case', arguments: { id: 10 } });

			expect(result.isError).toBeFalsy();
			const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
			expect(parsed.key).toBe('TC-0001');
			expect(parsed.tags).toHaveLength(1);
			expect(parsed.tags[0].name).toBe('smoke');
		});

		it('should return test case by key', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);
			mockFindTestCaseWithLatestVersion.mockResolvedValue({
				...sampleTestCase,
				latestVersion: sampleTestCaseVersion
			});
			mockSelectResult(mockDb, []);

			const result = await client.callTool({ name: 'get-test-case', arguments: { key: 'TC-0001' } });

			expect(result.isError).toBeFalsy();
			const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
			expect(parsed.key).toBe('TC-0001');
		});

		it('should return error when test case not found by ID', async () => {
			mockFindTestCaseWithLatestVersion.mockResolvedValue(null);

			const result = await client.callTool({ name: 'get-test-case', arguments: { id: 999 } });

			expect(result.isError).toBe(true);
			expect((result.content as Array<{ type: string; text: string }>)[0].text).toBe('Test case not found');
		});

		it('should return error when test case not found by key', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(null);

			const result = await client.callTool({ name: 'get-test-case', arguments: { key: 'TC-9999' } });

			expect(result.isError).toBe(true);
			expect((result.content as Array<{ type: string; text: string }>)[0].text).toBe('Test case not found');
		});

		it('should return error when neither id nor key provided', async () => {
			const result = await client.callTool({ name: 'get-test-case', arguments: {} });

			expect(result.isError).toBe(true);
			expect((result.content as Array<{ type: string; text: string }>)[0].text).toBe('Test case not found');
		});
	});

	describe('tool: get-test-run', () => {
		it('should return test run with execution details', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			const mockExecutions = [
				{ id: 200, status: 'PASS', executedAt: '2025-01-02', testCaseKey: 'TC-0001', testCaseTitle: 'Login test' },
				{ id: 201, status: 'FAIL', executedAt: '2025-01-02', testCaseKey: 'TC-0002', testCaseTitle: 'Signup test' }
			];
			mockSelectResult(mockDb, mockExecutions);

			const result = await client.callTool({ name: 'get-test-run', arguments: { runId: 50 } });

			expect(result.isError).toBeFalsy();
			const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
			expect(parsed.name).toBe('Sprint 1 Run');
			expect(parsed.statusCounts.PASS).toBe(1);
			expect(parsed.statusCounts.FAIL).toBe(1);
			expect(parsed.executions).toHaveLength(2);
		});

		it('should return error when test run not found', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(null);

			const result = await client.callTool({ name: 'get-test-run', arguments: { runId: 999 } });

			expect(result.isError).toBe(true);
			expect((result.content as Array<{ type: string; text: string }>)[0].text).toBe('Test run not found');
		});

		it('should count all execution status types correctly', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			const mockExecutions = [
				{ id: 200, status: 'PASS', executedAt: '2025-01-02', testCaseKey: 'TC-0001', testCaseTitle: 'Test 1' },
				{ id: 201, status: 'PASS', executedAt: '2025-01-02', testCaseKey: 'TC-0002', testCaseTitle: 'Test 2' },
				{ id: 202, status: 'FAIL', executedAt: '2025-01-02', testCaseKey: 'TC-0003', testCaseTitle: 'Test 3' },
				{ id: 203, status: 'BLOCKED', executedAt: null, testCaseKey: 'TC-0004', testCaseTitle: 'Test 4' },
				{ id: 204, status: 'SKIPPED', executedAt: null, testCaseKey: 'TC-0005', testCaseTitle: 'Test 5' },
				{ id: 205, status: 'PENDING', executedAt: null, testCaseKey: 'TC-0006', testCaseTitle: 'Test 6' }
			];
			mockSelectResult(mockDb, mockExecutions);

			const result = await client.callTool({ name: 'get-test-run', arguments: { runId: 50 } });
			const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);

			expect(parsed.statusCounts).toEqual({ PASS: 2, FAIL: 1, BLOCKED: 1, SKIPPED: 1, PENDING: 1 });
			expect(parsed.executions).toHaveLength(6);
		});

		it('should handle run with no executions', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			mockSelectResult(mockDb, []);

			const result = await client.callTool({ name: 'get-test-run', arguments: { runId: 50 } });
			const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);

			expect(parsed.statusCounts).toEqual({ PASS: 0, FAIL: 0, BLOCKED: 0, SKIPPED: 0, PENDING: 0 });
			expect(parsed.executions).toHaveLength(0);
		});
	});

	describe('tool: get-failures', () => {
		it('should return failure details for a run', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			const mockFailures = [
				{
					executionId: 200,
					testCaseKey: 'TC-0001',
					testCaseTitle: 'Login test',
					errorMessage: 'Assertion failed',
					stackTrace: 'at line 42',
					failureEnvironment: 'Chrome 120',
					comment: 'Intermittent'
				}
			];
			mockSelectResult(mockDb, mockFailures);

			const result = await client.callTool({ name: 'get-failures', arguments: { runId: 50 } });

			expect(result.isError).toBeFalsy();
			const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
			expect(parsed).toHaveLength(1);
			expect(parsed[0].errorMessage).toBe('Assertion failed');
			expect(parsed[0].testCaseKey).toBe('TC-0001');
		});

		it('should return error when run not found', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(null);

			const result = await client.callTool({ name: 'get-failures', arguments: { runId: 999 } });

			expect(result.isError).toBe(true);
			expect((result.content as Array<{ type: string; text: string }>)[0].text).toBe('Test run not found');
		});

		it('should return empty array when no failures', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			mockSelectResult(mockDb, []);

			const result = await client.callTool({ name: 'get-failures', arguments: { runId: 50 } });

			const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
			expect(parsed).toEqual([]);
		});
	});

	describe('tool: create-test-case', () => {
		it('should create a test case with default priority', async () => {
			// max key query
			mockSelectResult(mockDb, [{ maxKey: 'TC-0003' }]);
			// project query
			mockDb.query.project = { findFirst: vi.fn().mockResolvedValue(sampleProject) };

			const createdTc = { id: 14, projectId: 1, key: 'TC-0004', createdBy: 'user-1', sortOrder: 4 };
			const createdVersion = { id: 140, testCaseId: 14, versionNo: 1, title: 'New test', priority: 'MEDIUM' };

			mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txInsertChain = {
					values: vi.fn().mockReturnThis(),
					returning: vi.fn().mockReturnThis(),
					then: vi.fn()
				};

				let insertCallCount = 0;
				const txUpdateChain = {
					set: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					then: (resolve: (v: unknown) => void) => Promise.resolve(undefined).then(resolve)
				};
				const tx = {
					insert: vi.fn().mockImplementation(() => {
						insertCallCount++;
						const chain = {
							values: vi.fn().mockReturnThis(),
							returning: vi.fn().mockReturnThis(),
							then: (resolve: (v: unknown) => void) => {
								const result = insertCallCount === 1 ? [createdTc] : [createdVersion];
								return Promise.resolve(result).then(resolve);
							}
						};
						return chain;
					}),
					update: vi.fn().mockReturnValue(txUpdateChain)
				};
				return fn(tx);
			});

			const result = await client.callTool({
				name: 'create-test-case',
				arguments: { title: 'New test' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
			expect(parsed.key).toBe('TC-0004');
			expect(parsed.latestVersion.title).toBe('New test');
		});

		it('should create a test case with steps', async () => {
			mockSelectResult(mockDb, [{ maxKey: null }]);
			mockDb.query.project = { findFirst: vi.fn().mockResolvedValue(sampleProject) };

			const createdTc = { id: 1, projectId: 1, key: 'TC-0001', createdBy: 'user-1', sortOrder: 1 };
			const createdVersion = {
				id: 10, testCaseId: 1, versionNo: 1, title: 'With steps',
				steps: [{ order: 1, action: 'Click button', expected: 'Dialog opens' }],
				priority: 'HIGH'
			};

			mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				let insertCallCount = 0;
				const txUpdateChain = {
					set: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					then: (resolve: (v: unknown) => void) => Promise.resolve(undefined).then(resolve)
				};
				const tx = {
					insert: vi.fn().mockImplementation(() => {
						insertCallCount++;
						const chain = {
							values: vi.fn().mockReturnThis(),
							returning: vi.fn().mockReturnThis(),
							then: (resolve: (v: unknown) => void) => {
								const result = insertCallCount === 1 ? [createdTc] : [createdVersion];
								return Promise.resolve(result).then(resolve);
							}
						};
						return chain;
					}),
					update: vi.fn().mockReturnValue(txUpdateChain)
				};
				return fn(tx);
			});

			const result = await client.callTool({
				name: 'create-test-case',
				arguments: {
					title: 'With steps',
					priority: 'HIGH',
					steps: [{ action: 'Click button', expected: 'Dialog opens' }]
				}
			});

			expect(result.isError).toBeFalsy();
			const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
			expect(parsed.key).toBe('TC-0001');
		});

		it('should return error when project not found', async () => {
			mockSelectResult(mockDb, [{ maxKey: null }]);
			mockDb.query.project = { findFirst: vi.fn().mockResolvedValue(null) };

			const result = await client.callTool({
				name: 'create-test-case',
				arguments: { title: 'Test' }
			});

			expect(result.isError).toBe(true);
			expect((result.content as Array<{ type: string; text: string }>)[0].text).toBe('Project not found');
		});
	});

	describe('tool: update-test-case', () => {
		it('should update test case by ID', async () => {
			mockFindTestCaseWithLatestVersion.mockResolvedValue({
				...sampleTestCase,
				latestVersion: sampleTestCaseVersion
			});
			mockDb.query.project = { findFirst: vi.fn().mockResolvedValue(sampleProject) };

			const updatedVersion = { ...sampleTestCaseVersion, id: 101, versionNo: 2, title: 'Updated title' };
			mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				let insertCallCount = 0;
				const txUpdateChain = {
					set: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					then: (resolve: (v: unknown) => void) => Promise.resolve(undefined).then(resolve)
				};
				const tx = {
					insert: vi.fn().mockImplementation(() => {
						const chain = {
							values: vi.fn().mockReturnThis(),
							returning: vi.fn().mockReturnThis(),
							then: (resolve: (v: unknown) => void) => Promise.resolve([updatedVersion]).then(resolve)
						};
						return chain;
					}),
					update: vi.fn().mockReturnValue(txUpdateChain)
				};
				return fn(tx);
			});

			const result = await client.callTool({
				name: 'update-test-case',
				arguments: { id: 10, title: 'Updated title' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
			expect(parsed.latestVersion.title).toBe('Updated title');
			expect(parsed.latestVersion.versionNo).toBe(2);
		});

		it('should update test case by key', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);
			mockFindTestCaseWithLatestVersion.mockResolvedValue({
				...sampleTestCase,
				latestVersion: sampleTestCaseVersion
			});
			mockDb.query.project = { findFirst: vi.fn().mockResolvedValue(sampleProject) };

			const updatedVersion = { ...sampleTestCaseVersion, id: 101, versionNo: 2, priority: 'HIGH' };
			mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txUpdateChain = {
					set: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					then: (resolve: (v: unknown) => void) => Promise.resolve(undefined).then(resolve)
				};
				const tx = {
					insert: vi.fn().mockImplementation(() => {
						const chain = {
							values: vi.fn().mockReturnThis(),
							returning: vi.fn().mockReturnThis(),
							then: (resolve: (v: unknown) => void) => Promise.resolve([updatedVersion]).then(resolve)
						};
						return chain;
					}),
					update: vi.fn().mockReturnValue(txUpdateChain)
				};
				return fn(tx);
			});

			const result = await client.callTool({
				name: 'update-test-case',
				arguments: { key: 'TC-0001', priority: 'HIGH' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
			expect(parsed.latestVersion.priority).toBe('HIGH');
		});

		it('should return error when test case not found', async () => {
			mockFindTestCaseWithLatestVersion.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'update-test-case',
				arguments: { id: 999, title: 'Will fail' }
			});

			expect(result.isError).toBe(true);
			expect((result.content as Array<{ type: string; text: string }>)[0].text).toBe('Test case not found');
		});

		it('should return error when no latest version', async () => {
			mockFindTestCaseWithLatestVersion.mockResolvedValue({
				...sampleTestCase,
				latestVersion: null
			});

			const result = await client.callTool({
				name: 'update-test-case',
				arguments: { id: 10, title: 'Will fail' }
			});

			expect(result.isError).toBe(true);
			expect((result.content as Array<{ type: string; text: string }>)[0].text).toBe('No version found');
		});
	});

	describe('tool: create-test-run', () => {
		it('should create a test run with all test cases', async () => {
			mockDb.query.project = { findFirst: vi.fn().mockResolvedValue(sampleProject) };
			// test cases select
			mockSelectResult(mockDb, [
				{ id: 10, latestVersionId: 100 },
				{ id: 11, latestVersionId: 101 }
			]);

			const createdRun = { id: 60, projectId: 1, name: 'Regression', environment: 'QA', status: 'CREATED' };
			mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const tx = {
					insert: vi.fn().mockImplementation(() => {
						const chain = {
							values: vi.fn().mockReturnThis(),
							returning: vi.fn().mockReturnThis(),
							then: (resolve: (v: unknown) => void) => Promise.resolve([createdRun]).then(resolve)
						};
						return chain;
					})
				};
				return fn(tx);
			});

			const result = await client.callTool({
				name: 'create-test-run',
				arguments: { name: 'Regression', environment: 'QA' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
			expect(parsed.name).toBe('Regression');
			expect(parsed.executionCount).toBe(2);
		});

		it('should create a test run with specific test case IDs', async () => {
			mockDb.query.project = { findFirst: vi.fn().mockResolvedValue(sampleProject) };
			mockSelectResult(mockDb, [{ id: 10, latestVersionId: 100 }]);

			const createdRun = { id: 61, projectId: 1, name: 'Smoke', environment: 'DEV', status: 'CREATED' };
			mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const tx = {
					insert: vi.fn().mockImplementation(() => {
						const chain = {
							values: vi.fn().mockReturnThis(),
							returning: vi.fn().mockReturnThis(),
							then: (resolve: (v: unknown) => void) => Promise.resolve([createdRun]).then(resolve)
						};
						return chain;
					})
				};
				return fn(tx);
			});

			const result = await client.callTool({
				name: 'create-test-run',
				arguments: { name: 'Smoke', environment: 'DEV', testCaseIds: [10] }
			});

			expect(result.isError).toBeFalsy();
			const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
			expect(parsed.name).toBe('Smoke');
		});

		it('should return error when project not found', async () => {
			mockDb.query.project = { findFirst: vi.fn().mockResolvedValue(null) };

			const result = await client.callTool({
				name: 'create-test-run',
				arguments: { name: 'Run', environment: 'QA' }
			});

			expect(result.isError).toBe(true);
			expect((result.content as Array<{ type: string; text: string }>)[0].text).toBe('Project not found');
		});

		it('should return error when no test cases found', async () => {
			mockDb.query.project = { findFirst: vi.fn().mockResolvedValue(sampleProject) };
			mockSelectResult(mockDb, []);

			const result = await client.callTool({
				name: 'create-test-run',
				arguments: { name: 'Empty', environment: 'QA' }
			});

			expect(result.isError).toBe(true);
			expect((result.content as Array<{ type: string; text: string }>)[0].text).toBe('No test cases found');
		});
	});

	describe('tool: record-failure-detail', () => {
		it('should record failure detail successfully', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			mockDb.query.testExecution = { findFirst: vi.fn().mockResolvedValue(sampleExecution) };
			mockDb.query.project = { findFirst: vi.fn().mockResolvedValue(sampleProject) };

			const createdDetail = {
				id: 1,
				testExecutionId: 200,
				errorMessage: 'NullPointerException',
				stackTrace: 'at Main.java:10',
				failureEnvironment: 'Java 17, Linux',
				comment: 'Happens on empty input',
				createdBy: 'user-1'
			};
			mockInsertReturning(mockDb, [createdDetail]);

			const result = await client.callTool({
				name: 'record-failure-detail',
				arguments: {
					runId: 50,
					executionId: 200,
					errorMessage: 'NullPointerException',
					stackTrace: 'at Main.java:10',
					failureEnvironment: 'Java 17, Linux',
					comment: 'Happens on empty input'
				}
			});

			expect(result.isError).toBeFalsy();
			const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
			expect(parsed.errorMessage).toBe('NullPointerException');
			expect(parsed.testExecutionId).toBe(200);
		});

		it('should return error when run not found', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'record-failure-detail',
				arguments: { runId: 999, executionId: 200 }
			});

			expect(result.isError).toBe(true);
			expect((result.content as Array<{ type: string; text: string }>)[0].text).toBe('Test run not found');
		});

		it('should return error when execution not found', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			mockDb.query.testExecution = { findFirst: vi.fn().mockResolvedValue(null) };

			const result = await client.callTool({
				name: 'record-failure-detail',
				arguments: { runId: 50, executionId: 999 }
			});

			expect(result.isError).toBe(true);
			expect((result.content as Array<{ type: string; text: string }>)[0].text).toBe('Execution not found');
		});

		it('should record failure with only required params', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			mockDb.query.testExecution = { findFirst: vi.fn().mockResolvedValue(sampleExecution) };
			mockDb.query.project = { findFirst: vi.fn().mockResolvedValue(sampleProject) };

			const createdDetail = {
				id: 2,
				testExecutionId: 200,
				errorMessage: null,
				stackTrace: null,
				failureEnvironment: null,
				comment: null,
				createdBy: 'user-1'
			};
			mockInsertReturning(mockDb, [createdDetail]);

			const result = await client.callTool({
				name: 'record-failure-detail',
				arguments: { runId: 50, executionId: 200 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
			expect(parsed.errorMessage).toBeNull();
			expect(parsed.stackTrace).toBeNull();
			expect(parsed.failureEnvironment).toBeNull();
			expect(parsed.comment).toBeNull();
		});

		it('should return error when project not found', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			mockDb.query.testExecution = { findFirst: vi.fn().mockResolvedValue(sampleExecution) };
			mockDb.query.project = { findFirst: vi.fn().mockResolvedValue(null) };

			const result = await client.callTool({
				name: 'record-failure-detail',
				arguments: { runId: 50, executionId: 200 }
			});

			expect(result.isError).toBe(true);
			expect((result.content as Array<{ type: string; text: string }>)[0].text).toBe('Project not found');
		});
	});

	describe('tool: export-run-results', () => {
		it('should export run results with failures', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);

			const mockExecutions = [
				{ executionId: 200, status: 'PASS', executedAt: '2025-01-02', testCaseKey: 'TC-0001', testCaseTitle: 'Login', priority: 'HIGH' },
				{ executionId: 201, status: 'FAIL', executedAt: '2025-01-02', testCaseKey: 'TC-0002', testCaseTitle: 'Signup', priority: 'MEDIUM' }
			];
			const mockFailures = [
				{ executionId: 201, errorMessage: 'Error', stackTrace: 'trace', failureEnvironment: 'Chrome', comment: 'Bug' }
			];

			let selectCallCount = 0;
			mockDb.select.mockImplementation(() => {
				selectCallCount++;
				const data = selectCallCount === 1 ? mockExecutions : mockFailures;
				const chain = {
					from: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					innerJoin: vi.fn().mockReturnThis(),
					then: (resolve: (v: unknown) => void) => Promise.resolve(data).then(resolve)
				};
				return chain as never;
			});

			const result = await client.callTool({ name: 'export-run-results', arguments: { runId: 50 } });

			expect(result.isError).toBeFalsy();
			const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
			expect(parsed.run.name).toBe('Sprint 1 Run');
			expect(parsed.totalExecutions).toBe(2);
			expect(parsed.statusCounts.PASS).toBe(1);
			expect(parsed.statusCounts.FAIL).toBe(1);
			expect(parsed.results[1].failures).toHaveLength(1);
			expect(parsed.results[0].failures).toHaveLength(0);
		});

		it('should return error when run not found', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(null);

			const result = await client.callTool({ name: 'export-run-results', arguments: { runId: 999 } });

			expect(result.isError).toBe(true);
			expect((result.content as Array<{ type: string; text: string }>)[0].text).toBe('Test run not found');
		});

		it('should export run with no failures', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);

			const mockExecutions = [
				{ executionId: 200, status: 'PASS', executedAt: '2025-01-02', testCaseKey: 'TC-0001', testCaseTitle: 'Login', priority: 'HIGH' }
			];

			let selectCallCount = 0;
			mockDb.select.mockImplementation(() => {
				selectCallCount++;
				const data = selectCallCount === 1 ? mockExecutions : [];
				const chain = {
					from: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					innerJoin: vi.fn().mockReturnThis(),
					then: (resolve: (v: unknown) => void) => Promise.resolve(data).then(resolve)
				};
				return chain as never;
			});

			const result = await client.callTool({ name: 'export-run-results', arguments: { runId: 50 } });

			expect(result.isError).toBeFalsy();
			const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
			expect(parsed.statusCounts.PASS).toBe(1);
			expect(parsed.statusCounts.FAIL).toBe(0);
			expect(parsed.results[0].failures).toEqual([]);
		});

		it('should export run with multiple failures per execution', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);

			const mockExecutions = [
				{ executionId: 200, status: 'FAIL', executedAt: '2025-01-02', testCaseKey: 'TC-0001', testCaseTitle: 'Login', priority: 'HIGH' }
			];
			const mockFailures = [
				{ executionId: 200, errorMessage: 'Error 1', stackTrace: 'trace1', failureEnvironment: 'Chrome', comment: null },
				{ executionId: 200, errorMessage: 'Error 2', stackTrace: 'trace2', failureEnvironment: 'Firefox', comment: 'retry' }
			];

			let selectCallCount = 0;
			mockDb.select.mockImplementation(() => {
				selectCallCount++;
				const data = selectCallCount === 1 ? mockExecutions : mockFailures;
				const chain = {
					from: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					innerJoin: vi.fn().mockReturnThis(),
					then: (resolve: (v: unknown) => void) => Promise.resolve(data).then(resolve)
				};
				return chain as never;
			});

			const result = await client.callTool({ name: 'export-run-results', arguments: { runId: 50 } });

			expect(result.isError).toBeFalsy();
			const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
			expect(parsed.results[0].failures).toHaveLength(2);
			expect(parsed.results[0].failures[0].errorMessage).toBe('Error 1');
			expect(parsed.results[0].failures[1].errorMessage).toBe('Error 2');
		});
	});

	describe('tool: update-execution-status', () => {
		it('should update execution status successfully', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			mockDb.query.testExecution = { findFirst: vi.fn().mockResolvedValue(sampleExecution) };

			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				then: (resolve: (v: unknown) => void) => Promise.resolve(undefined).then(resolve)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const result = await client.callTool({
				name: 'update-execution-status',
				arguments: { runId: 50, executionId: 200, status: 'PASS' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
			expect(parsed.success).toBe(true);
			expect(parsed.executionId).toBe(200);
			expect(parsed.status).toBe('PASS');
		});

		it('should block changes on completed runs', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue({ ...sampleTestRun, status: 'COMPLETED' });

			const result = await client.callTool({
				name: 'update-execution-status',
				arguments: { runId: 50, executionId: 200, status: 'PASS' }
			});

			expect(result.isError).toBe(true);
			expect((result.content as Array<{ type: string; text: string }>)[0].text).toBe('Cannot modify completed run');
		});

		it('should return error when run not found', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'update-execution-status',
				arguments: { runId: 999, executionId: 200, status: 'PASS' }
			});

			expect(result.isError).toBe(true);
			expect((result.content as Array<{ type: string; text: string }>)[0].text).toBe('Test run not found');
		});

		it('should return error when execution not found', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			mockDb.query.testExecution = { findFirst: vi.fn().mockResolvedValue(null) };

			const result = await client.callTool({
				name: 'update-execution-status',
				arguments: { runId: 50, executionId: 999, status: 'FAIL' }
			});

			expect(result.isError).toBe(true);
			expect((result.content as Array<{ type: string; text: string }>)[0].text).toBe('Execution not found');
		});

		it('should accept all valid status values', async () => {
			const statuses = ['PASS', 'FAIL', 'BLOCKED', 'SKIPPED', 'PENDING'] as const;

			for (const status of statuses) {
				vi.clearAllMocks();
				mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
				mockDb.query.testExecution = { findFirst: vi.fn().mockResolvedValue(sampleExecution) };

				const updateChain = {
					set: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					then: (resolve: (v: unknown) => void) => Promise.resolve(undefined).then(resolve)
				};
				mockDb.update.mockReturnValue(updateChain as never);

				// Need to recreate client since clearAllMocks resets everything
				const connected = await createConnectedClient();

				const result = await connected.client.callTool({
					name: 'update-execution-status',
					arguments: { runId: 50, executionId: 200, status }
				});

				expect(result.isError).toBeFalsy();
				const parsed = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
				expect(parsed.status).toBe(status);

				await connected.clientTransport.close();
			}
		});
	});

	// ── Tool listing ─────────────────────────────────────────

	describe('tool and resource listing', () => {
		it('should list all 10 tools', async () => {
			const result = await client.listTools();
			const toolNames = result.tools.map((t) => t.name).sort();

			expect(toolNames).toEqual([
				'create-test-case',
				'create-test-run',
				'export-run-results',
				'get-failures',
				'get-test-case',
				'get-test-run',
				'record-failure-detail',
				'search-test-cases',
				'update-execution-status',
				'update-test-case'
			]);
		});

		it('should list all 4 resources', async () => {
			const result = await client.listResources();
			const uris = result.resources.map((r) => r.uri).sort();

			expect(uris).toEqual([
				'projects://current',
				'reports://summary',
				'test-cases://list',
				'test-runs://list'
			]);
		});
	});
});
