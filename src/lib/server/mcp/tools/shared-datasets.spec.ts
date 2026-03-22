import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockDb, mockInsertReturning, mockSelectResult, mockUpdateReturning } from '$lib/server/test-helpers/mock-db';
import { sampleProject } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	project: { id: 'id', createdBy: 'created_by' },
	sharedDataSet: { id: 'id', projectId: 'project_id', name: 'name', parameters: 'parameters', rows: 'rows', createdBy: 'created_by', createdAt: 'created_at' }
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

const { registerSharedDataSetTools } = await import('./shared-datasets');

const PROJECT_ID = 1;

type ContentArray = Array<{ type: string; text: string }>;
function parseResult(result: { content?: unknown }) {
	return JSON.parse((result.content as ContentArray)[0].text);
}

async function createClient() {
	const server = new McpServer({ name: 'test', version: '1.0.0' });
	registerSharedDataSetTools(server, PROJECT_ID);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: 'test-client', version: '1.0.0' });
	await client.connect(clientTransport);
	return { client, close: () => clientTransport.close() };
}

const sampleDataset = {
	id: 1,
	projectId: 1,
	name: 'Login Credentials',
	parameters: ['username', 'password'],
	rows: [{ username: 'admin', password: 'pass123' }],
	createdBy: 'user-1',
	createdAt: new Date('2025-01-01')
};

describe('MCP shared-dataset tools', () => {
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

	// ── list-shared-datasets ────────────────────────────

	describe('list-shared-datasets', () => {
		it('should return empty list', async () => {
			mockSelectResult(mockDb, []);

			const result = await client.callTool({
				name: 'list-shared-datasets',
				arguments: {}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed).toEqual([]);
		});

		it('should return shared datasets', async () => {
			mockSelectResult(mockDb, [
				{ id: 1, name: 'Login Credentials', parameters: ['username', 'password'], createdAt: new Date('2025-01-01') }
			]);

			const result = await client.callTool({
				name: 'list-shared-datasets',
				arguments: {}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed).toHaveLength(1);
			expect(parsed[0].name).toBe('Login Credentials');
			expect(parsed[0].parameters).toEqual(['username', 'password']);
		});
	});

	// ── create-shared-dataset ───────────────────────────

	describe('create-shared-dataset', () => {
		it('should return error when project not found', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'create-shared-dataset',
				arguments: { name: 'Dataset', parameters: ['col1'] }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Project not found');
		});

		it('should create a shared dataset', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockInsertReturning(mockDb, [sampleDataset]);

			const result = await client.callTool({
				name: 'create-shared-dataset',
				arguments: {
					name: 'Login Credentials',
					parameters: ['username', 'password'],
					rows: [{ username: 'admin', password: 'pass123' }]
				}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('Login Credentials');
			expect(parsed.parameters).toEqual(['username', 'password']);
		});
	});

	// ── delete-shared-dataset ───────────────────────────

	describe('delete-shared-dataset', () => {
		it('should delete a shared dataset', async () => {
			mockDb.query.sharedDataSet.findFirst.mockResolvedValue(sampleDataset);

			const result = await client.callTool({
				name: 'delete-shared-dataset',
				arguments: { datasetId: 1 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.deletedId).toBe(1);
			expect(mockDb.delete).toHaveBeenCalledTimes(1);
		});

		it('should return error when shared dataset not found', async () => {
			mockDb.query.sharedDataSet.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'delete-shared-dataset',
				arguments: { datasetId: 999 }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Shared dataset not found');
		});
	});

	// ── update-shared-dataset ───────────────────────────

	describe('update-shared-dataset', () => {
		it('should update a shared dataset', async () => {
			mockDb.query.sharedDataSet.findFirst.mockResolvedValue(sampleDataset);
			mockUpdateReturning(mockDb, [{ ...sampleDataset, name: 'Updated Dataset', parameters: ['email', 'password'] }]);

			const result = await client.callTool({
				name: 'update-shared-dataset',
				arguments: { datasetId: 1, name: 'Updated Dataset', parameters: ['email', 'password'] }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('Updated Dataset');
			expect(parsed.parameters).toEqual(['email', 'password']);
		});

		it('should return error when shared dataset not found', async () => {
			mockDb.query.sharedDataSet.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'update-shared-dataset',
				arguments: { datasetId: 999, name: 'Updated' }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Shared dataset not found');
		});
	});
});
