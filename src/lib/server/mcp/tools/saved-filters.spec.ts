import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockDb, mockInsertReturning, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { sampleProject } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	project: { id: 'id', createdBy: 'created_by' },
	savedFilter: { id: 'id', projectId: 'project_id', userId: 'user_id', name: 'name', filterType: 'filter_type', filters: 'filters', sortOrder: 'sort_order', createdAt: 'created_at', updatedAt: 'updated_at' }
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

const { registerSavedFilterTools } = await import('./saved-filters');

const PROJECT_ID = 1;

type ContentArray = Array<{ type: string; text: string }>;
function parseResult(result: { content?: unknown }) {
	return JSON.parse((result.content as ContentArray)[0].text);
}

async function createClient() {
	const server = new McpServer({ name: 'test', version: '1.0.0' });
	registerSavedFilterTools(server, PROJECT_ID);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: 'test-client', version: '1.0.0' });
	await client.connect(clientTransport);
	return { client, close: () => clientTransport.close() };
}

const sampleSavedFilter = {
	id: 1,
	projectId: 1,
	userId: 'user-1',
	name: 'High Priority',
	filterType: 'test_cases',
	filters: { priority: 'HIGH' },
	sortOrder: 0,
	createdAt: new Date('2025-01-01'),
	updatedAt: new Date('2025-01-01')
};

describe('MCP saved-filter tools', () => {
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

	// ── list-saved-filters ──────────────────────────────

	describe('list-saved-filters', () => {
		it('should return empty list', async () => {
			mockSelectResult(mockDb, []);

			const result = await client.callTool({
				name: 'list-saved-filters',
				arguments: {}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed).toEqual([]);
		});

		it('should return saved filters', async () => {
			mockSelectResult(mockDb, [
				{ id: 1, name: 'High Priority', filterType: 'test_cases', filters: { priority: 'HIGH' } }
			]);

			const result = await client.callTool({
				name: 'list-saved-filters',
				arguments: {}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed).toHaveLength(1);
			expect(parsed[0].name).toBe('High Priority');
			expect(parsed[0].filters.priority).toBe('HIGH');
		});
	});

	// ── create-saved-filter ─────────────────────────────

	describe('create-saved-filter', () => {
		it('should return error when project not found', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'create-saved-filter',
				arguments: { name: 'Filter', filters: { status: 'PASS' } }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Project not found');
		});

		it('should create a saved filter', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockInsertReturning(mockDb, [sampleSavedFilter]);

			const result = await client.callTool({
				name: 'create-saved-filter',
				arguments: { name: 'High Priority', filters: { priority: 'HIGH' } }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('High Priority');
			expect(parsed.filterType).toBe('test_cases');
		});
	});

	// ── delete-saved-filter ─────────────────────────────

	describe('delete-saved-filter', () => {
		it('should delete a saved filter', async () => {
			mockDb.query.savedFilter.findFirst.mockResolvedValue(sampleSavedFilter);

			const result = await client.callTool({
				name: 'delete-saved-filter',
				arguments: { filterId: 1 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.deletedId).toBe(1);
			expect(mockDb.delete).toHaveBeenCalledTimes(1);
		});

		it('should return error when saved filter not found', async () => {
			mockDb.query.savedFilter.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'delete-saved-filter',
				arguments: { filterId: 999 }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Saved filter not found');
		});
	});
});
