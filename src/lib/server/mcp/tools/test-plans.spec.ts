import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockDb, mockSelectResult, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { sampleProject } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	project: { id: 'id', createdBy: 'created_by' },
	testCase: { id: 'id', projectId: 'project_id', latestVersionId: 'latest_version_id', key: 'key' },
	testCaseVersion: { id: 'id', title: 'title', priority: 'priority' },
	testRun: { id: 'id', projectId: 'project_id', name: 'name', environment: 'environment', createdBy: 'created_by', testPlanId: 'test_plan_id' },
	testExecution: { id: 'id', testRunId: 'test_run_id', testCaseVersionId: 'test_case_version_id' },
	testPlan: { id: 'id', projectId: 'project_id', name: 'name', description: 'description', status: 'status', milestone: 'milestone', startDate: 'start_date', endDate: 'end_date', createdBy: 'created_by', createdAt: 'created_at', updatedAt: 'updated_at' },
	testPlanTestCase: { id: 'id', testPlanId: 'test_plan_id', testCaseId: 'test_case_id', position: 'position', addedAt: 'added_at' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
		{ raw: (s: string) => s }
	),
	inArray: vi.fn((a: unknown, b: unknown) => [a, b])
}));

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const { registerTestPlanTools } = await import('./test-plans');

const PROJECT_ID = 1;

type ContentArray = Array<{ type: string; text: string }>;
function parseResult(result: { content?: unknown }) {
	return JSON.parse((result.content as ContentArray)[0].text);
}

async function createClient() {
	const server = new McpServer({ name: 'test', version: '1.0.0' });
	registerTestPlanTools(server, PROJECT_ID);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: 'test-client', version: '1.0.0' });
	await client.connect(clientTransport);
	return { client, close: () => clientTransport.close() };
}

const samplePlan = {
	id: 1,
	projectId: 1,
	name: 'Sprint 1 Plan',
	description: 'Plan for sprint 1',
	status: 'DRAFT',
	milestone: null,
	startDate: null,
	endDate: null,
	createdBy: 'user-1',
	createdAt: new Date('2025-01-01'),
	updatedAt: new Date('2025-01-01')
};

describe('MCP test-plan tools', () => {
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

	// ── get-test-plan ────────────────────────────────────

	describe('get-test-plan', () => {
		it('should return plan with items', async () => {
			mockDb.query.testPlan.findFirst.mockResolvedValue(samplePlan);
			mockSelectResult(mockDb, [
				{ id: 1, testCaseId: 10, position: 0, addedAt: '2025-01-01', key: 'TC-0001', title: 'Login', priority: 'HIGH' }
			]);

			const result = await client.callTool({ name: 'get-test-plan', arguments: { planId: 1 } });

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('Sprint 1 Plan');
			expect(parsed.items).toHaveLength(1);
			expect(parsed.items[0].key).toBe('TC-0001');
		});

		it('should return error when plan not found', async () => {
			mockDb.query.testPlan.findFirst.mockResolvedValue(null);

			const result = await client.callTool({ name: 'get-test-plan', arguments: { planId: 999 } });

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Test plan not found');
		});
	});

	// ── create-test-plan ─────────────────────────────────

	describe('create-test-plan', () => {
		it('should create a plan', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockInsertReturning(mockDb, [{ ...samplePlan, id: 2, name: 'New Plan' }]);

			const result = await client.callTool({
				name: 'create-test-plan',
				arguments: { name: 'New Plan', description: 'Desc' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('New Plan');
		});

		it('should return error when project not found', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'create-test-plan',
				arguments: { name: 'Plan' }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Project not found');
		});
	});

	// ── update-test-plan ─────────────────────────────────

	describe('update-test-plan', () => {
		it('should update plan fields', async () => {
			mockDb.query.testPlan.findFirst
				.mockResolvedValueOnce(samplePlan)
				.mockResolvedValueOnce({ ...samplePlan, name: 'Updated', status: 'ACTIVE' });

			const result = await client.callTool({
				name: 'update-test-plan',
				arguments: { planId: 1, name: 'Updated', status: 'ACTIVE' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('Updated');
			expect(parsed.status).toBe('ACTIVE');
		});

		it('should return error when plan not found', async () => {
			mockDb.query.testPlan.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'update-test-plan',
				arguments: { planId: 999, name: 'Updated' }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Test plan not found');
		});
	});

	// ── add-plan-items ───────────────────────────────────

	describe('add-plan-items', () => {
		it('should add test cases to plan', async () => {
			mockDb.query.testPlan.findFirst.mockResolvedValue(samplePlan);
			mockSelectResult(mockDb, [{ maxPos: 2 }]);
			mockInsertReturning(mockDb, []);

			const result = await client.callTool({
				name: 'add-plan-items',
				arguments: { planId: 1, testCaseIds: [10, 11] }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.addedCount).toBe(2);
		});

		it('should return error when plan not found', async () => {
			mockDb.query.testPlan.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'add-plan-items',
				arguments: { planId: 999, testCaseIds: [10] }
			});

			expect(result.isError).toBe(true);
		});
	});

	// ── remove-plan-items ────────────────────────────────

	describe('remove-plan-items', () => {
		it('should remove test cases from plan', async () => {
			mockDb.query.testPlan.findFirst.mockResolvedValue(samplePlan);

			const result = await client.callTool({
				name: 'remove-plan-items',
				arguments: { planId: 1, testCaseIds: [10] }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.removedCount).toBe(1);
		});

		it('should return error when plan not found', async () => {
			mockDb.query.testPlan.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'remove-plan-items',
				arguments: { planId: 999, testCaseIds: [10] }
			});

			expect(result.isError).toBe(true);
		});
	});

	// ── create-run-from-plan ─────────────────────────────

	describe('create-run-from-plan', () => {
		it('should create a run from plan', async () => {
			mockDb.query.testPlan.findFirst.mockResolvedValue(samplePlan);
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);

			let selectCallCount = 0;
			mockDb.select.mockImplementation(() => {
				selectCallCount++;
				const data = selectCallCount === 1
					? [{ testCaseId: 10 }, { testCaseId: 11 }]
					: [{ id: 10, latestVersionId: 100 }, { id: 11, latestVersionId: 101 }];
				const chain = {
					from: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					orderBy: vi.fn().mockReturnThis(),
					then: (resolve: (v: unknown) => void) => Promise.resolve(data).then(resolve)
				};
				return chain as never;
			});

			const createdRun = { id: 60, projectId: 1, name: 'Sprint 1 Plan - QA', environment: 'QA', createdBy: 'user-1' };
			mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				let insertCallCount = 0;
				const tx = {
					insert: vi.fn().mockImplementation(() => {
						insertCallCount++;
						return {
							values: vi.fn().mockReturnThis(),
							returning: vi.fn().mockReturnThis(),
							then: (resolve: (v: unknown) => void) =>
								Promise.resolve(insertCallCount === 1 ? [createdRun] : []).then(resolve)
						};
					})
				};
				return fn(tx);
			});

			const result = await client.callTool({
				name: 'create-run-from-plan',
				arguments: { planId: 1, environment: 'QA' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.executionCount).toBe(2);
			expect(parsed.planId).toBe(1);
		});

		it('should return error when plan has no test cases', async () => {
			mockDb.query.testPlan.findFirst.mockResolvedValue(samplePlan);
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockSelectResult(mockDb, []);

			const result = await client.callTool({
				name: 'create-run-from-plan',
				arguments: { planId: 1, environment: 'QA' }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Test plan has no test cases');
		});

		it('should return error when plan not found', async () => {
			mockDb.query.testPlan.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'create-run-from-plan',
				arguments: { planId: 999, environment: 'QA' }
			});

			expect(result.isError).toBe(true);
		});
	});

	// ── delete-test-plan ────────────────────────────────

	describe('delete-test-plan', () => {
		it('should delete a test plan', async () => {
			mockDb.query.testPlan.findFirst.mockResolvedValue(samplePlan);

			const result = await client.callTool({
				name: 'delete-test-plan',
				arguments: { planId: 1 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.deletedId).toBe(1);
			expect(mockDb.delete).toHaveBeenCalledTimes(2);
		});

		it('should return error when plan not found', async () => {
			mockDb.query.testPlan.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'delete-test-plan',
				arguments: { planId: 999 }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Test plan not found');
		});
	});

	// ── list-test-plans ─────────────────────────────────

	describe('list-test-plans', () => {
		it('should return plans array', async () => {
			mockSelectResult(mockDb, [
				{ id: 1, name: 'Sprint 1 Plan', status: 'DRAFT', milestone: null, startDate: null, endDate: null, createdAt: new Date('2025-01-01') },
				{ id: 2, name: 'Sprint 2 Plan', status: 'ACTIVE', milestone: 'v1.0', startDate: null, endDate: null, createdAt: new Date('2025-02-01') }
			]);

			const result = await client.callTool({
				name: 'list-test-plans',
				arguments: {}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed).toHaveLength(2);
			expect(parsed[0].name).toBe('Sprint 1 Plan');
			expect(parsed[1].status).toBe('ACTIVE');
		});
	});
});
