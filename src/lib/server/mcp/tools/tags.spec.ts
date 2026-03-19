import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockDb, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { sampleProject, sampleTestCase } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	project: { id: 'id', createdBy: 'created_by' },
	testCase: { id: 'id', projectId: 'project_id' },
	tag: { id: 'id', projectId: 'project_id', name: 'name', color: 'color', createdBy: 'created_by', createdAt: 'created_at' },
	testCaseTag: { testCaseId: 'test_case_id', tagId: 'tag_id' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args)
}));

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const { registerTagTools } = await import('./tags');

const PROJECT_ID = 1;

type ContentArray = Array<{ type: string; text: string }>;
function parseResult(result: { content?: unknown }) {
	return JSON.parse((result.content as ContentArray)[0].text);
}

async function createClient() {
	const server = new McpServer({ name: 'test', version: '1.0.0' });
	registerTagTools(server, PROJECT_ID);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: 'test-client', version: '1.0.0' });
	await client.connect(clientTransport);
	return { client, close: () => clientTransport.close() };
}

const sampleTag = {
	id: 1,
	projectId: 1,
	name: 'smoke',
	color: '#ff0000',
	createdBy: 'user-1',
	createdAt: new Date('2025-01-01')
};

describe('MCP tag tools', () => {
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

	// ── create-tag ───────────────────────────────────────

	describe('create-tag', () => {
		it('should create a tag with custom color', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockInsertReturning(mockDb, [sampleTag]);

			const result = await client.callTool({
				name: 'create-tag',
				arguments: { name: 'smoke', color: '#ff0000' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('smoke');
			expect(parsed.color).toBe('#ff0000');
		});

		it('should create a tag with default color', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockInsertReturning(mockDb, [{ ...sampleTag, color: '#6b7280' }]);

			const result = await client.callTool({
				name: 'create-tag',
				arguments: { name: 'regression' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.color).toBe('#6b7280');
		});

		it('should return error when project not found', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'create-tag',
				arguments: { name: 'tag' }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Project not found');
		});
	});

	// ── delete-tag ───────────────────────────────────────

	describe('delete-tag', () => {
		it('should delete a tag and its associations', async () => {
			mockDb.query.tag.findFirst.mockResolvedValue(sampleTag);

			const result = await client.callTool({
				name: 'delete-tag',
				arguments: { tagId: 1 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.deletedId).toBe(1);
			// Should have called delete twice (testCaseTag then tag)
			expect(mockDb.delete).toHaveBeenCalledTimes(2);
		});

		it('should return error when tag not found', async () => {
			mockDb.query.tag.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'delete-tag',
				arguments: { tagId: 999 }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Tag not found');
		});
	});

	// ── add-tag-to-test-case ─────────────────────────────

	describe('add-tag-to-test-case', () => {
		it('should add tag to test case', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);
			mockDb.query.tag.findFirst.mockResolvedValue(sampleTag);

			const result = await client.callTool({
				name: 'add-tag-to-test-case',
				arguments: { testCaseId: 10, tagId: 1 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.testCaseId).toBe(10);
			expect(parsed.tagId).toBe(1);
		});

		it('should return error when test case not found', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'add-tag-to-test-case',
				arguments: { testCaseId: 999, tagId: 1 }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Test case not found');
		});

		it('should return error when tag not found', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);
			mockDb.query.tag.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'add-tag-to-test-case',
				arguments: { testCaseId: 10, tagId: 999 }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Tag not found');
		});
	});

	// ── remove-tag-from-test-case ────────────────────────

	describe('remove-tag-from-test-case', () => {
		it('should remove tag from test case', async () => {
			const result = await client.callTool({
				name: 'remove-tag-from-test-case',
				arguments: { testCaseId: 10, tagId: 1 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.testCaseId).toBe(10);
			expect(parsed.tagId).toBe(1);
		});
	});
});
