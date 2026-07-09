import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	createMockDb,
	mockDeleteReturning,
	mockSelectResult,
	mockInsertReturning,
	mockTransactionDeleteReturning,
	mockUpdateReturning
} from '$lib/server/test-helpers/mock-db';
import { sampleProject } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	project: { id: 'id', createdBy: 'created_by' },
	testCase: { id: 'id', projectId: 'project_id', key: 'key', latestVersionId: 'latest_version_id' },
	testCaseVersion: { id: 'id', title: 'title', priority: 'priority' },
	testSuite: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		description: 'description',
		createdBy: 'created_by',
		createdAt: 'created_at'
	},
	testSuiteItem: { id: 'id', suiteId: 'suite_id', testCaseId: 'test_case_id', addedAt: 'added_at' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	inArray: vi.fn((a: unknown, b: unknown) => [a, b])
}));

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const { registerTestSuiteTools } = await import('./test-suites');

const PROJECT_ID = 1;

type ContentArray = Array<{ type: string; text: string }>;
function parseResult(result: unknown) {
	const toolResult = result as { content?: unknown };
	return JSON.parse(((result as { content?: unknown }).content as ContentArray)[0].text);
}

async function createClient() {
	const server = new McpServer({ name: 'test', version: '1.0.0' });
	registerTestSuiteTools(server, PROJECT_ID);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: 'test-client', version: '1.0.0' });
	await client.connect(clientTransport);
	return { client, close: () => clientTransport.close() };
}

const sampleSuite = {
	id: 1,
	projectId: 1,
	name: 'Smoke Tests',
	description: 'Critical path tests',
	createdBy: 'user-1',
	createdAt: new Date('2025-01-01')
};

describe('MCP test-suite tools', () => {
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

	// ── get-test-suite ───────────────────────────────────

	describe('get-test-suite', () => {
		it('should return suite with items', async () => {
			mockDb.query.testSuite.findFirst.mockResolvedValue(sampleSuite);
			const selectChain = mockSelectResult(mockDb, [
				{
					id: 1,
					testCaseId: 10,
					addedAt: '2025-01-01',
					key: 'TC-0001',
					title: 'Login',
					priority: 'HIGH'
				}
			]);

			const result = await client.callTool({ name: 'get-test-suite', arguments: { suiteId: 1 } });

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('Smoke Tests');
			expect(parsed.items).toHaveLength(1);
			expect(parsed.items[0].key).toBe('TC-0001');
			expect(selectChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['suite_id', 1],
					['project_id', PROJECT_ID]
				])
			);
		});

		it('should return error when suite not found', async () => {
			mockDb.query.testSuite.findFirst.mockResolvedValue(null);

			const result = await client.callTool({ name: 'get-test-suite', arguments: { suiteId: 999 } });

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Test suite not found'
			);
		});
	});

	// ── create-test-suite ────────────────────────────────

	describe('create-test-suite', () => {
		it('should create a suite', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockInsertReturning(mockDb, [sampleSuite]);

			const result = await client.callTool({
				name: 'create-test-suite',
				arguments: { name: 'Smoke Tests', description: 'Critical path tests' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('Smoke Tests');
		});

		it('should return error when project not found', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'create-test-suite',
				arguments: { name: 'Suite' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Project not found'
			);
		});

		it('should reject empty names before creating a suite', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);

			const result = await client.callTool({
				name: 'create-test-suite',
				arguments: { name: '   ' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Name is required'
			);
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should reject long descriptions before creating a suite', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);

			const result = await client.callTool({
				name: 'create-test-suite',
				arguments: { name: 'Suite', description: 'A'.repeat(1001) }
			});

			expect(result.isError).toBe(true);
			expect(mockDb.insert).not.toHaveBeenCalled();
		});
	});

	// ── add-suite-items ──────────────────────────────────

	describe('add-suite-items', () => {
		it('should add test cases to suite', async () => {
			mockDb.query.testSuite.findFirst.mockResolvedValue(sampleSuite);
			mockSelectResult(mockDb, [{ id: 10 }, { id: 11 }]);
			mockInsertReturning(mockDb, [{ id: 1 }, { id: 2 }]);

			const result = await client.callTool({
				name: 'add-suite-items',
				arguments: { suiteId: 1, testCaseIds: [10, 11] }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.addedCount).toBe(2);
		});

		it('should report zero added when all suite items already exist', async () => {
			mockDb.query.testSuite.findFirst.mockResolvedValue(sampleSuite);
			mockSelectResult(mockDb, [{ id: 10 }, { id: 11 }]);
			mockInsertReturning(mockDb, []);

			const result = await client.callTool({
				name: 'add-suite-items',
				arguments: { suiteId: 1, testCaseIds: [10, 11] }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.addedCount).toBe(0);
		});

		it('should reject test cases outside the current project', async () => {
			mockDb.query.testSuite.findFirst.mockResolvedValue(sampleSuite);
			mockSelectResult(mockDb, [{ id: 10 }]);

			const result = await client.callTool({
				name: 'add-suite-items',
				arguments: { suiteId: 1, testCaseIds: [10, 999] }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Test case not found'
			);
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should reject duplicate test case IDs before querying the database', async () => {
			const result = await client.callTool({
				name: 'add-suite-items',
				arguments: { suiteId: 1, testCaseIds: [10, 10] }
			});

			expect(result.isError).toBe(true);
			expect(mockDb.query.testSuite.findFirst).not.toHaveBeenCalled();
			expect(mockDb.select).not.toHaveBeenCalled();
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should return error when suite not found', async () => {
			mockDb.query.testSuite.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'add-suite-items',
				arguments: { suiteId: 999, testCaseIds: [10] }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Test suite not found'
			);
		});
	});

	// ── remove-suite-items ───────────────────────────────

	describe('remove-suite-items', () => {
		it('should remove test cases from suite', async () => {
			mockDb.query.testSuite.findFirst.mockResolvedValue(sampleSuite);
			mockDeleteReturning(mockDb, [{ id: 1 }]);

			const result = await client.callTool({
				name: 'remove-suite-items',
				arguments: { suiteId: 1, testCaseIds: [10] }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.removedCount).toBe(1);
		});

		it('should report actual removed suite items', async () => {
			mockDb.query.testSuite.findFirst.mockResolvedValue(sampleSuite);
			mockDeleteReturning(mockDb, [{ id: 1 }]);

			const result = await client.callTool({
				name: 'remove-suite-items',
				arguments: { suiteId: 1, testCaseIds: [10, 11] }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.removedCount).toBe(1);
		});

		it('should report zero removed when suite items do not exist', async () => {
			mockDb.query.testSuite.findFirst.mockResolvedValue(sampleSuite);
			mockDeleteReturning(mockDb, []);

			const result = await client.callTool({
				name: 'remove-suite-items',
				arguments: { suiteId: 1, testCaseIds: [10] }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.removedCount).toBe(0);
		});

		it('should reject empty test case IDs before querying the database', async () => {
			const result = await client.callTool({
				name: 'remove-suite-items',
				arguments: { suiteId: 1, testCaseIds: [] }
			});

			expect(result.isError).toBe(true);
			expect(mockDb.query.testSuite.findFirst).not.toHaveBeenCalled();
			expect(mockDb.delete).not.toHaveBeenCalled();
		});

		it('should return error when suite not found', async () => {
			mockDb.query.testSuite.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'remove-suite-items',
				arguments: { suiteId: 999, testCaseIds: [10] }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Test suite not found'
			);
		});
	});

	// ── update-test-suite ───────────────────────────────

	describe('update-test-suite', () => {
		it('should update a suite', async () => {
			mockDb.query.testSuite.findFirst.mockResolvedValue(sampleSuite);
			const updateChain = mockUpdateReturning(mockDb, [
				{ ...sampleSuite, name: 'Updated Suite', description: 'New desc' }
			]);

			const result = await client.callTool({
				name: 'update-test-suite',
				arguments: { suiteId: 1, name: 'Updated Suite', description: 'New desc' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('Updated Suite');
			expect(parsed.description).toBe('New desc');
			expect(updateChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 1],
					['project_id', 1]
				])
			);
		});

		it('should return error when suite not found', async () => {
			mockDb.query.testSuite.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'update-test-suite',
				arguments: { suiteId: 999, name: 'Updated' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Test suite not found'
			);
		});

		it('should reject empty names before updating a suite', async () => {
			mockDb.query.testSuite.findFirst.mockResolvedValue(sampleSuite);

			const result = await client.callTool({
				name: 'update-test-suite',
				arguments: { suiteId: 1, name: '   ' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Name is required'
			);
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should reject empty updates', async () => {
			mockDb.query.testSuite.findFirst.mockResolvedValue(sampleSuite);

			const result = await client.callTool({
				name: 'update-test-suite',
				arguments: { suiteId: 1 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'No fields to update'
			);
			expect(mockDb.update).not.toHaveBeenCalled();
		});
	});

	// ── delete-test-suite ───────────────────────────────

	describe('delete-test-suite', () => {
		it('should delete a suite', async () => {
			mockDb.query.testSuite.findFirst.mockResolvedValue(sampleSuite);
			const { deleteChain } = mockTransactionDeleteReturning(mockDb, [sampleSuite]);

			const result = await client.callTool({
				name: 'delete-test-suite',
				arguments: { suiteId: 1 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.deletedId).toBe(1);
			expect(mockDb.transaction).toHaveBeenCalledTimes(1);
			expect(mockDb.delete).not.toHaveBeenCalled();
			expect(deleteChain.returning).toHaveBeenCalledTimes(1);
		});

		it('should return error when suite not found', async () => {
			mockDb.query.testSuite.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'delete-test-suite',
				arguments: { suiteId: 999 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Test suite not found'
			);
			expect(mockDb.transaction).not.toHaveBeenCalled();
		});

		it('should return error when delete affects no suite', async () => {
			mockDb.query.testSuite.findFirst.mockResolvedValue(sampleSuite);
			mockTransactionDeleteReturning(mockDb, []);

			const result = await client.callTool({
				name: 'delete-test-suite',
				arguments: { suiteId: 1 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Test suite not found'
			);
		});
	});
});
