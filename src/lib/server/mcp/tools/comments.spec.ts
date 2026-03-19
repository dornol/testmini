import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockDb, mockSelectResult, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { sampleProject, sampleTestCase, sampleTestRun, sampleExecution } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	project: { id: 'id', createdBy: 'created_by' },
	testCase: { id: 'id', projectId: 'project_id' },
	testRun: { id: 'id', projectId: 'project_id' },
	testExecution: { id: 'id', testRunId: 'test_run_id' },
	testCaseComment: { id: 'id', testCaseId: 'test_case_id', userId: 'user_id', content: 'content', parentId: 'parent_id', createdAt: 'created_at' },
	executionComment: { id: 'id', testExecutionId: 'test_execution_id', userId: 'user_id', content: 'content', parentId: 'parent_id', createdAt: 'created_at' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args)
}));

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const { registerCommentTools } = await import('./comments');

const PROJECT_ID = 1;

type ContentArray = Array<{ type: string; text: string }>;
function parseResult(result: { content?: unknown }) {
	return JSON.parse((result.content as ContentArray)[0].text);
}

async function createClient() {
	const server = new McpServer({ name: 'test', version: '1.0.0' });
	registerCommentTools(server, PROJECT_ID);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: 'test-client', version: '1.0.0' });
	await client.connect(clientTransport);
	return { client, close: () => clientTransport.close() };
}

describe('MCP comment tools', () => {
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

	// ── add-test-case-comment ────────────────────────────

	describe('add-test-case-comment', () => {
		it('should add a comment to a test case', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockInsertReturning(mockDb, [{ id: 1, testCaseId: 10, userId: 'user-1', content: 'Looks good', parentId: null, createdAt: '2025-01-01' }]);

			const result = await client.callTool({
				name: 'add-test-case-comment',
				arguments: { testCaseId: 10, content: 'Looks good' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.content).toBe('Looks good');
			expect(parsed.userId).toBe('user-1');
		});

		it('should return error when test case not found', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'add-test-case-comment',
				arguments: { testCaseId: 999, content: 'Comment' }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Test case not found');
		});

		it('should return error when project not found', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);
			mockDb.query.project.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'add-test-case-comment',
				arguments: { testCaseId: 10, content: 'Comment' }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Project not found');
		});
	});

	// ── list-test-case-comments ──────────────────────────

	describe('list-test-case-comments', () => {
		it('should list comments for a test case', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);
			mockSelectResult(mockDb, [
				{ id: 1, content: 'First comment', userId: 'user-1', parentId: null, createdAt: '2025-01-01' },
				{ id: 2, content: 'Reply', userId: 'user-2', parentId: 1, createdAt: '2025-01-02' }
			]);

			const result = await client.callTool({
				name: 'list-test-case-comments',
				arguments: { testCaseId: 10 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed).toHaveLength(2);
			expect(parsed[0].content).toBe('First comment');
			expect(parsed[1].parentId).toBe(1);
		});

		it('should return error when test case not found', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'list-test-case-comments',
				arguments: { testCaseId: 999 }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Test case not found');
		});
	});

	// ── add-execution-comment ────────────────────────────

	describe('add-execution-comment', () => {
		it('should add a comment to an execution', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			mockDb.query.testExecution.findFirst.mockResolvedValue(sampleExecution);
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockInsertReturning(mockDb, [{ id: 5, testExecutionId: 200, userId: 'user-1', content: 'Failed on retry', parentId: null, createdAt: '2025-01-01' }]);

			const result = await client.callTool({
				name: 'add-execution-comment',
				arguments: { runId: 50, executionId: 200, content: 'Failed on retry' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.content).toBe('Failed on retry');
		});

		it('should return error when run not found', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'add-execution-comment',
				arguments: { runId: 999, executionId: 200, content: 'Comment' }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Test run not found');
		});

		it('should return error when execution not found', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			mockDb.query.testExecution.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'add-execution-comment',
				arguments: { runId: 50, executionId: 999, content: 'Comment' }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Execution not found');
		});
	});
});
