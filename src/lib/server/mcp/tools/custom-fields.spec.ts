import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockDb, mockInsertReturning, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { sampleProject } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	project: { id: 'id', createdBy: 'created_by' },
	customField: { id: 'id', projectId: 'project_id', name: 'name', fieldType: 'field_type', options: 'options', required: 'required', sortOrder: 'sort_order', createdBy: 'created_by', createdAt: 'created_at' }
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

const { registerCustomFieldTools } = await import('./custom-fields');

const PROJECT_ID = 1;

type ContentArray = Array<{ type: string; text: string }>;
function parseResult(result: { content?: unknown }) {
	return JSON.parse((result.content as ContentArray)[0].text);
}

async function createClient() {
	const server = new McpServer({ name: 'test', version: '1.0.0' });
	registerCustomFieldTools(server, PROJECT_ID);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: 'test-client', version: '1.0.0' });
	await client.connect(clientTransport);
	return { client, close: () => clientTransport.close() };
}

const sampleCustomField = {
	id: 1,
	projectId: 1,
	name: 'Browser',
	fieldType: 'SELECT',
	options: ['Chrome', 'Firefox'],
	required: false,
	sortOrder: 0,
	createdBy: 'user-1',
	createdAt: new Date('2025-01-01')
};

describe('MCP custom-field tools', () => {
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

	// ── list-custom-fields ──────────────────────────────

	describe('list-custom-fields', () => {
		it('should return empty list', async () => {
			mockSelectResult(mockDb, []);

			const result = await client.callTool({
				name: 'list-custom-fields',
				arguments: {}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed).toEqual([]);
		});

		it('should return custom fields', async () => {
			mockSelectResult(mockDb, [
				{ id: 1, name: 'Browser', fieldType: 'SELECT', options: ['Chrome', 'Firefox'], required: false, sortOrder: 0 }
			]);

			const result = await client.callTool({
				name: 'list-custom-fields',
				arguments: {}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed).toHaveLength(1);
			expect(parsed[0].name).toBe('Browser');
			expect(parsed[0].fieldType).toBe('SELECT');
		});
	});

	// ── create-custom-field ─────────────────────────────

	describe('create-custom-field', () => {
		it('should return error when project not found', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'create-custom-field',
				arguments: { name: 'Browser', fieldType: 'TEXT' }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Project not found');
		});

		it('should create a TEXT custom field', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockInsertReturning(mockDb, [{ ...sampleCustomField, fieldType: 'TEXT', options: null }]);

			const result = await client.callTool({
				name: 'create-custom-field',
				arguments: { name: 'Notes', fieldType: 'TEXT' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.fieldType).toBe('TEXT');
		});

		it('should create a SELECT custom field with options', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockInsertReturning(mockDb, [sampleCustomField]);

			const result = await client.callTool({
				name: 'create-custom-field',
				arguments: { name: 'Browser', fieldType: 'SELECT', options: ['Chrome', 'Firefox'] }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('Browser');
			expect(parsed.fieldType).toBe('SELECT');
			expect(parsed.options).toEqual(['Chrome', 'Firefox']);
		});
	});

	// ── delete-custom-field ─────────────────────────────

	describe('delete-custom-field', () => {
		it('should delete a custom field', async () => {
			mockDb.query.customField.findFirst.mockResolvedValue(sampleCustomField);

			const result = await client.callTool({
				name: 'delete-custom-field',
				arguments: { fieldId: 1 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.deletedId).toBe(1);
			expect(mockDb.delete).toHaveBeenCalledTimes(1);
		});

		it('should return error when custom field not found', async () => {
			mockDb.query.customField.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'delete-custom-field',
				arguments: { fieldId: 999 }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Custom field not found');
		});
	});
});
