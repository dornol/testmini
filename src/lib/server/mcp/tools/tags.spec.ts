import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	createMockDb,
	mockDeleteReturning,
	mockInsertReturning,
	mockTransactionDeleteReturning,
	mockUpdateReturning
} from '$lib/server/test-helpers/mock-db';
import { sampleProject, sampleTestCase } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	project: { id: 'id', createdBy: 'created_by' },
	testCase: { id: 'id', projectId: 'project_id' },
	tag: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		color: 'color',
		createdBy: 'created_by',
		createdAt: 'created_at'
	},
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
function parseResult(result: unknown) {
	const toolResult = result as { content?: unknown };
	return JSON.parse(((result as { content?: unknown }).content as ContentArray)[0].text);
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
			mockDb.query.tag.findFirst.mockResolvedValue(null);
			const insertChain = mockInsertReturning(mockDb, [sampleTag]);

			const result = await client.callTool({
				name: 'create-tag',
				arguments: { name: ' smoke ', color: ' #ff0000 ' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('smoke');
			expect(parsed.color).toBe('#ff0000');
			expect(insertChain.values).toHaveBeenCalledWith(
				expect.objectContaining({ name: 'smoke', color: '#ff0000' })
			);
		});

		it('should create a tag with default color', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockDb.query.tag.findFirst.mockResolvedValue(null);
			mockInsertReturning(mockDb, [{ ...sampleTag, color: '#6b7280' }]);

			const result = await client.callTool({
				name: 'create-tag',
				arguments: { name: 'regression' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.color).toBe('#6b7280');
		});

		it('should return error when tag insert returns no row', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockDb.query.tag.findFirst.mockResolvedValue(null);
			mockInsertReturning(mockDb, []);

			const result = await client.callTool({
				name: 'create-tag',
				arguments: { name: 'smoke' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Failed to create tag'
			);
		});

		it('should return error when project not found', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'create-tag',
				arguments: { name: 'tag' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Project not found'
			);
		});

		it('should reject blank names after trimming', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);

			const result = await client.callTool({
				name: 'create-tag',
				arguments: { name: '   ' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toContain(
				'Tag name is required'
			);
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should reject invalid colors', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);

			const result = await client.callTool({
				name: 'create-tag',
				arguments: { name: 'smoke', color: 'red' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toContain(
				'Invalid hex color'
			);
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should reject duplicate tag names before insert', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockDb.query.tag.findFirst.mockResolvedValue(sampleTag);

			const result = await client.callTool({
				name: 'create-tag',
				arguments: { name: 'smoke' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toContain(
				'already exists'
			);
			expect(mockDb.insert).not.toHaveBeenCalled();
		});
	});

	// ── delete-tag ───────────────────────────────────────

	describe('delete-tag', () => {
		it('should delete a tag and its associations', async () => {
			mockDb.query.tag.findFirst.mockResolvedValue(sampleTag);
			const { deleteChain } = mockTransactionDeleteReturning(mockDb, [sampleTag]);

			const result = await client.callTool({
				name: 'delete-tag',
				arguments: { tagId: 1 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.deletedId).toBe(1);
			expect(mockDb.transaction).toHaveBeenCalledTimes(1);
			expect(mockDb.delete).not.toHaveBeenCalled();
			expect(deleteChain.returning).toHaveBeenCalledTimes(1);
		});

		it('should return error when tag not found', async () => {
			mockDb.query.tag.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'delete-tag',
				arguments: { tagId: 999 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Tag not found'
			);
			expect(mockDb.transaction).not.toHaveBeenCalled();
		});

		it('should return error when delete affects no tag', async () => {
			mockDb.query.tag.findFirst.mockResolvedValue(sampleTag);
			mockTransactionDeleteReturning(mockDb, []);

			const result = await client.callTool({
				name: 'delete-tag',
				arguments: { tagId: 1 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Tag not found'
			);
		});
	});

	// ── add-tag-to-test-case ─────────────────────────────

	describe('add-tag-to-test-case', () => {
		it('should add tag to test case', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);
			mockDb.query.tag.findFirst.mockResolvedValue(sampleTag);
			mockInsertReturning(mockDb, [{ testCaseId: 10 }]);

			const result = await client.callTool({
				name: 'add-tag-to-test-case',
				arguments: { testCaseId: 10, tagId: 1 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.testCaseId).toBe(10);
			expect(parsed.tagId).toBe(1);
			expect(parsed.added).toBe(true);
		});

		it('should report added false when tag link already exists', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);
			mockDb.query.tag.findFirst.mockResolvedValue(sampleTag);
			mockInsertReturning(mockDb, []);

			const result = await client.callTool({
				name: 'add-tag-to-test-case',
				arguments: { testCaseId: 10, tagId: 1 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.added).toBe(false);
		});

		it('should return error when test case not found', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'add-tag-to-test-case',
				arguments: { testCaseId: 999, tagId: 1 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Test case not found'
			);
		});

		it('should return error when tag not found', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);
			mockDb.query.tag.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'add-tag-to-test-case',
				arguments: { testCaseId: 10, tagId: 999 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Tag not found'
			);
		});
	});

	// ── remove-tag-from-test-case ────────────────────────

	describe('remove-tag-from-test-case', () => {
		it('should remove tag from test case', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);
			mockDb.query.tag.findFirst.mockResolvedValue(sampleTag);
			mockDeleteReturning(mockDb, [{ testCaseId: 10 }]);

			const result = await client.callTool({
				name: 'remove-tag-from-test-case',
				arguments: { testCaseId: 10, tagId: 1 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.testCaseId).toBe(10);
			expect(parsed.tagId).toBe(1);
			expect(parsed.removed).toBe(true);
		});

		it('should report removed false when tag link does not exist', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);
			mockDb.query.tag.findFirst.mockResolvedValue(sampleTag);
			mockDeleteReturning(mockDb, []);

			const result = await client.callTool({
				name: 'remove-tag-from-test-case',
				arguments: { testCaseId: 10, tagId: 1 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.removed).toBe(false);
		});

		it('should reject removal when test case is not in the current project', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'remove-tag-from-test-case',
				arguments: { testCaseId: 999, tagId: 1 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Test case not found'
			);
			expect(mockDb.delete).not.toHaveBeenCalled();
		});

		it('should reject removal when tag is not in the current project', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);
			mockDb.query.tag.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'remove-tag-from-test-case',
				arguments: { testCaseId: 10, tagId: 999 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Tag not found'
			);
			expect(mockDb.delete).not.toHaveBeenCalled();
		});
	});

	// ── update-tag ──────────────────────────────────────

	describe('update-tag', () => {
		it('should update name', async () => {
			mockDb.query.tag.findFirst.mockResolvedValueOnce(sampleTag).mockResolvedValueOnce(null);
			const updateChain = mockUpdateReturning(mockDb, [{ ...sampleTag, name: 'critical' }]);

			const result = await client.callTool({
				name: 'update-tag',
				arguments: { tagId: 1, name: ' critical ' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('critical');
			expect(updateChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 1],
					['project_id', 1]
				])
			);
			expect(updateChain.set).toHaveBeenCalledWith({ name: 'critical' });
		});

		it('should return error when tag not found', async () => {
			mockDb.query.tag.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'update-tag',
				arguments: { tagId: 999, name: 'nope' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Tag not found'
			);
		});

		it('should return error when tag disappears before update', async () => {
			mockDb.query.tag.findFirst.mockResolvedValueOnce(sampleTag).mockResolvedValueOnce(null);
			mockUpdateReturning(mockDb, []);

			const result = await client.callTool({
				name: 'update-tag',
				arguments: { tagId: 1, name: 'critical' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Tag not found'
			);
		});

		it('should reject invalid update colors', async () => {
			const result = await client.callTool({
				name: 'update-tag',
				arguments: { tagId: 1, color: 'blue' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toContain(
				'Invalid hex color'
			);
			expect(mockDb.query.tag.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should reject update names with control characters before lookup', async () => {
			const result = await client.callTool({
				name: 'update-tag',
				arguments: { tagId: 1, name: 'smoke\u0000tag' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Name must not contain control characters'
			);
			expect(mockDb.query.tag.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should reject duplicate update names before update', async () => {
			mockDb.query.tag.findFirst
				.mockResolvedValueOnce(sampleTag)
				.mockResolvedValueOnce({ ...sampleTag, id: 2, name: 'critical' });

			const result = await client.callTool({
				name: 'update-tag',
				arguments: { tagId: 1, name: 'critical' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toContain(
				'already exists'
			);
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should reject an empty update', async () => {
			const result = await client.callTool({
				name: 'update-tag',
				arguments: { tagId: 1 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'No fields to update'
			);
			expect(mockDb.query.tag.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});
	});
});
