import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockDb, mockSelectResult, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { sampleProject } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	project: { id: 'id', createdBy: 'created_by' },
	testCase: { projectId: 'project_id', groupId: 'group_id' },
	testCaseGroup: { id: 'id', projectId: 'project_id', name: 'name', sortOrder: 'sort_order', color: 'color', createdBy: 'created_by' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args)
}));

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const { registerGroupTools } = await import('./groups');

const PROJECT_ID = 1;

type ContentArray = Array<{ type: string; text: string }>;
function parseResult(result: { content?: unknown }) {
	return JSON.parse((result.content as ContentArray)[0].text);
}

async function createClient() {
	const server = new McpServer({ name: 'test', version: '1.0.0' });
	registerGroupTools(server, PROJECT_ID);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: 'test-client', version: '1.0.0' });
	await client.connect(clientTransport);
	return { client, close: () => clientTransport.close() };
}

const sampleGroup = {
	id: 1,
	projectId: 1,
	name: 'Authentication',
	sortOrder: 0,
	color: '#3b82f6',
	createdBy: 'user-1'
};

describe('MCP group tools', () => {
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

	// ── list-groups ──────────────────────────────────────

	describe('list-groups', () => {
		it('should return all groups ordered by sortOrder', async () => {
			mockSelectResult(mockDb, [
				{ id: 1, name: 'Authentication', sortOrder: 0, color: '#3b82f6' },
				{ id: 2, name: 'Reports', sortOrder: 1, color: '#f59e0b' }
			]);

			const result = await client.callTool({ name: 'list-groups', arguments: {} });

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed).toHaveLength(2);
			expect(parsed[0].name).toBe('Authentication');
			expect(parsed[1].name).toBe('Reports');
		});

		it('should return empty array when no groups', async () => {
			mockSelectResult(mockDb, []);

			const result = await client.callTool({ name: 'list-groups', arguments: {} });

			const parsed = parseResult(result);
			expect(parsed).toEqual([]);
		});
	});

	// ── create-group ─────────────────────────────────────

	describe('create-group', () => {
		it('should create a group with color', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockInsertReturning(mockDb, [sampleGroup]);

			const result = await client.callTool({
				name: 'create-group',
				arguments: { name: 'Authentication', color: '#3b82f6' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('Authentication');
			expect(parsed.color).toBe('#3b82f6');
		});

		it('should create a group without color', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockInsertReturning(mockDb, [{ ...sampleGroup, color: null }]);

			const result = await client.callTool({
				name: 'create-group',
				arguments: { name: 'Reports' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.color).toBeNull();
		});

		it('should return error when project not found', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'create-group',
				arguments: { name: 'Group' }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Project not found');
		});
	});

	// ── delete-group ─────────────────────────────────────

	describe('delete-group', () => {
		it('should delete group and unassign test cases', async () => {
			mockDb.query.testCaseGroup.findFirst.mockResolvedValue(sampleGroup);

			const result = await client.callTool({
				name: 'delete-group',
				arguments: { groupId: 1 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.deletedId).toBe(1);
			// Should have called update (unassign) and delete
			expect(mockDb.update).toHaveBeenCalled();
			expect(mockDb.delete).toHaveBeenCalled();
		});

		it('should return error when group not found', async () => {
			mockDb.query.testCaseGroup.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'delete-group',
				arguments: { groupId: 999 }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Group not found');
		});
	});
});
