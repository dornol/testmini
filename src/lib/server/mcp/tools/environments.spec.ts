import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	createMockDb,
	mockInsertReturning,
	mockSelectResult,
	mockUpdateReturning
} from '$lib/server/test-helpers/mock-db';
import { sampleProject } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	project: { id: 'id', createdBy: 'created_by' },
	environmentConfig: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		color: 'color',
		position: 'position',
		isDefault: 'is_default',
		baseUrl: 'base_url',
		memo: 'memo',
		createdBy: 'created_by'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	asc: vi.fn((a: unknown) => ['asc', a])
}));
vi.mock('../helpers', async () => {
	const actual = (await vi.importActual('../helpers')) as Record<string, unknown>;
	return { ...actual };
});

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const { registerEnvironmentTools } = await import('./environments');

const PROJECT_ID = 1;

type ContentArray = Array<{ type: string; text: string }>;
function parseResult(result: unknown) {
	const toolResult = result as { content?: unknown };
	return JSON.parse(((result as { content?: unknown }).content as ContentArray)[0].text);
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
		vi.clearAllMocks();
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
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Project not found'
			);
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

		it('should reject blank environment names after trimming', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);

			const result = await client.callTool({
				name: 'create-environment',
				arguments: { name: '   ' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toContain(
				'Environment name is required'
			);
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should assign next position and clear existing default when creating a default', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockSelectResult(mockDb, [{ position: 2 }]);
			const insertChain = mockInsertReturning(mockDb, [{ ...sampleEnv, position: 3 }]);

			const result = await client.callTool({
				name: 'create-environment',
				arguments: {
					name: ' STAGING ',
					color: '#f59e0b',
					isDefault: true,
					baseUrl: '',
					memo: '  shared staging  '
				}
			});

			expect(result.isError).toBeFalsy();
			expect(mockDb.update).toHaveBeenCalledWith(expect.anything());
			expect(insertChain.values).toHaveBeenCalledWith(
				expect.objectContaining({
					name: 'STAGING',
					color: '#f59e0b',
					position: 3,
					isDefault: true,
					baseUrl: null,
					memo: 'shared staging'
				})
			);
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
			const deleteChain = mockDb.delete.mock.results[0]?.value as {
				where: ReturnType<typeof vi.fn>;
			};
			expect(deleteChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 1],
					['project_id', 1]
				])
			);
		});

		it('should return error when not found', async () => {
			mockDb.query.environmentConfig.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'delete-environment',
				arguments: { environmentId: 999 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Environment not found'
			);
		});
	});

	// ── update-environment ──────────────────────────────

	describe('update-environment', () => {
		it('should update name and color', async () => {
			mockDb.query.environmentConfig.findFirst.mockResolvedValue(sampleEnv);
			const updateChain = mockUpdateReturning(mockDb, [
				{ ...sampleEnv, name: 'STAGING', color: '#f59e0b' }
			]);

			const result = await client.callTool({
				name: 'update-environment',
				arguments: { environmentId: 1, name: 'STAGING', color: '#f59e0b' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('STAGING');
			expect(parsed.color).toBe('#f59e0b');
			expect(updateChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 1],
					['project_id', 1]
				])
			);
		});

		it('should return error when not found', async () => {
			mockDb.query.environmentConfig.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'update-environment',
				arguments: { environmentId: 999, name: 'Nope' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Environment not found'
			);
		});

		it('should clear existing default and normalize optional fields when updating default', async () => {
			mockDb.query.environmentConfig.findFirst.mockResolvedValue(sampleEnv);
			const updateChain = mockUpdateReturning(mockDb, [
				{ ...sampleEnv, isDefault: true, baseUrl: null, memo: null }
			]);

			const result = await client.callTool({
				name: 'update-environment',
				arguments: {
					environmentId: 1,
					isDefault: true,
					baseUrl: '',
					memo: '  requires VPN  '
				}
			});

			expect(result.isError).toBeFalsy();
			expect(mockDb.update).toHaveBeenCalledTimes(2);
			expect(updateChain.set).toHaveBeenCalledWith({ isDefault: false });
			expect(updateChain.set).toHaveBeenCalledWith({
				isDefault: true,
				baseUrl: null,
				memo: 'requires VPN'
			});
		});
	});
});
