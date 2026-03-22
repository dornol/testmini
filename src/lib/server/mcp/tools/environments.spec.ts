import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockDb, mockInsertReturning, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { sampleProject } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	project: { id: 'id', createdBy: 'created_by' },
	environmentConfig: { id: 'id', projectId: 'project_id', name: 'name', color: 'color', position: 'position', isDefault: 'is_default', baseUrl: 'base_url', memo: 'memo', createdBy: 'created_by' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args)
}));
vi.mock('../helpers', async () => {
	const actual = await vi.importActual('../helpers') as Record<string, unknown>;
	return { ...actual };
});

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const { registerEnvironmentTools } = await import('./environments');

const PROJECT_ID = 1;

type ContentArray = Array<{ type: string; text: string }>;
function parseResult(result: { content?: unknown }) {
	return JSON.parse((result.content as ContentArray)[0].text);
}

async function createClient() {
	const server = new McpServer({ name: 'test', version: '1.0.0' });
	registerEnvironmentTools(server, PROJECT_ID);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: 'test-client', version: '1.0.0' });
	await client.connect(clientTransport);
	return { client, close: () => clientTransport.close() };
}

const sampleEnv = {
	id: 1,
	projectId: 1,
	name: 'DEV',
	color: '#22c55e',
	position: 0,
	isDefault: true,
	baseUrl: null,
	memo: null,
	createdBy: 'user-1',
	createdAt: new Date('2025-01-01')
};

describe('MCP environment tools', () => {
	let client: Client;
	let close: () => Promise<void>;

	beforeEach(async () => {
		const c = await createClient();
		client = c.client;
		close = c.close;
	});

	afterEach(async () => {
		await close();
	});

	// ── list-environments ────────────────────────────────

	describe('list-environments', () => {
		it('should return empty array', async () => {
			mockSelectResult(mockDb, []);

			const result = await client.callTool({
				name: 'list-environments',
				arguments: {}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed).toEqual([]);
		});

		it('should return environments', async () => {
			mockSelectResult(mockDb, [sampleEnv]);

			const result = await client.callTool({
				name: 'list-environments',
				arguments: {}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed).toHaveLength(1);
			expect(parsed[0].name).toBe('DEV');
		});
	});

	// ── create-environment ───────────────────────────────

	describe('create-environment', () => {
		it('should return error when project not found', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'create-environment',
				arguments: { name: 'DEV' }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Project not found');
		});

		it('should create with name and color', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockInsertReturning(mockDb, [sampleEnv]);

			const result = await client.callTool({
				name: 'create-environment',
				arguments: { name: 'DEV', color: '#22c55e' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('DEV');
			expect(parsed.color).toBe('#22c55e');
		});
	});

	// ── delete-environment ───────────────────────────────

	describe('delete-environment', () => {
		it('should delete successfully', async () => {
			mockDb.query.environmentConfig.findFirst.mockResolvedValue(sampleEnv);

			const result = await client.callTool({
				name: 'delete-environment',
				arguments: { environmentId: 1 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.deletedId).toBe(1);
			expect(mockDb.delete).toHaveBeenCalledTimes(1);
		});

		it('should return error when not found', async () => {
			mockDb.query.environmentConfig.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'delete-environment',
				arguments: { environmentId: 999 }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Environment not found');
		});
	});
});
