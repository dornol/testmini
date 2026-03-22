import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockDb, mockSelectResult, mockInsertReturning, mockUpdateReturning } from '$lib/server/test-helpers/mock-db';
import { sampleProject } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	project: { id: 'id', createdBy: 'created_by' },
	testCase: { id: 'id', projectId: 'project_id', key: 'key', latestVersionId: 'latest_version_id' },
	testCaseVersion: { id: 'id', title: 'title', priority: 'priority' },
	testSuite: { id: 'id', projectId: 'project_id', name: 'name', description: 'description', createdBy: 'created_by', createdAt: 'created_at' },
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
function parseResult(result: { content?: unknown }) {
	return JSON.parse((result.content as ContentArray)[0].text);
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
			mockSelectResult(mockDb, [
				{ id: 1, testCaseId: 10, addedAt: '2025-01-01', key: 'TC-0001', title: 'Login', priority: 'HIGH' }
			]);

			const result = await client.callTool({ name: 'get-test-suite', arguments: { suiteId: 1 } });

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('Smoke Tests');
			expect(parsed.items).toHaveLength(1);
			expect(parsed.items[0].key).toBe('TC-0001');
		});

		it('should return error when suite not found', async () => {
			mockDb.query.testSuite.findFirst.mockResolvedValue(null);

			const result = await client.callTool({ name: 'get-test-suite', arguments: { suiteId: 999 } });

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Test suite not found');
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
			expect((result.content as ContentArray)[0].text).toBe('Project not found');
		});
	});

	// ── add-suite-items ──────────────────────────────────

	describe('add-suite-items', () => {
		it('should add test cases to suite', async () => {
			mockDb.query.testSuite.findFirst.mockResolvedValue(sampleSuite);

			const result = await client.callTool({
				name: 'add-suite-items',
				arguments: { suiteId: 1, testCaseIds: [10, 11] }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.addedCount).toBe(2);
		});

		it('should return error when suite not found', async () => {
			mockDb.query.testSuite.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'add-suite-items',
				arguments: { suiteId: 999, testCaseIds: [10] }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Test suite not found');
		});
	});

	// ── remove-suite-items ───────────────────────────────

	describe('remove-suite-items', () => {
		it('should remove test cases from suite', async () => {
			mockDb.query.testSuite.findFirst.mockResolvedValue(sampleSuite);

			const result = await client.callTool({
				name: 'remove-suite-items',
				arguments: { suiteId: 1, testCaseIds: [10] }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.removedCount).toBe(1);
		});

		it('should return error when suite not found', async () => {
			mockDb.query.testSuite.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'remove-suite-items',
				arguments: { suiteId: 999, testCaseIds: [10] }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Test suite not found');
		});
	});

	// ── update-test-suite ───────────────────────────────

	describe('update-test-suite', () => {
		it('should update a suite', async () => {
			mockDb.query.testSuite.findFirst.mockResolvedValue(sampleSuite);
			mockUpdateReturning(mockDb, [{ ...sampleSuite, name: 'Updated Suite', description: 'New desc' }]);

			const result = await client.callTool({
				name: 'update-test-suite',
				arguments: { suiteId: 1, name: 'Updated Suite', description: 'New desc' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('Updated Suite');
			expect(parsed.description).toBe('New desc');
		});

		it('should return error when suite not found', async () => {
			mockDb.query.testSuite.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'update-test-suite',
				arguments: { suiteId: 999, name: 'Updated' }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Test suite not found');
		});
	});

	// ── delete-test-suite ───────────────────────────────

	describe('delete-test-suite', () => {
		it('should delete a suite', async () => {
			mockDb.query.testSuite.findFirst.mockResolvedValue(sampleSuite);

			const result = await client.callTool({
				name: 'delete-test-suite',
				arguments: { suiteId: 1 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.deletedId).toBe(1);
			expect(mockDb.delete).toHaveBeenCalledTimes(2);
		});

		it('should return error when suite not found', async () => {
			mockDb.query.testSuite.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'delete-test-suite',
				arguments: { suiteId: 999 }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Test suite not found');
		});
	});
});
