import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockDb, mockInsertReturning, mockSelectResult, mockUpdateReturning } from '$lib/server/test-helpers/mock-db';
import { sampleProject } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	project: { id: 'id', createdBy: 'created_by' },
	projectWebhook: { id: 'id', projectId: 'project_id', name: 'name', url: 'url', events: 'events', enabled: 'enabled', secret: 'secret', createdBy: 'created_by', createdAt: 'created_at' }
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

const { registerWebhookTools } = await import('./webhooks');

const PROJECT_ID = 1;

type ContentArray = Array<{ type: string; text: string }>;
function parseResult(result: { content?: unknown }) {
	return JSON.parse((result.content as ContentArray)[0].text);
}

async function createClient() {
	const server = new McpServer({ name: 'test', version: '1.0.0' });
	registerWebhookTools(server, PROJECT_ID);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: 'test-client', version: '1.0.0' });
	await client.connect(clientTransport);
	return { client, close: () => clientTransport.close() };
}

const sampleWebhook = {
	id: 1,
	projectId: 1,
	name: 'CI Webhook',
	url: 'https://ci.example.com/hook',
	events: ['run.completed'],
	enabled: true,
	secret: null,
	createdBy: 'user-1',
	createdAt: new Date('2025-01-01')
};

describe('MCP webhook tools', () => {
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

	// ── list-webhooks ───────────────────────────────────

	describe('list-webhooks', () => {
		it('should return empty list', async () => {
			mockSelectResult(mockDb, []);

			const result = await client.callTool({
				name: 'list-webhooks',
				arguments: {}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed).toEqual([]);
		});

		it('should return webhooks', async () => {
			mockSelectResult(mockDb, [
				{ id: 1, name: 'CI Webhook', url: 'https://ci.example.com/hook', events: ['run.completed'], enabled: true, createdAt: new Date('2025-01-01') }
			]);

			const result = await client.callTool({
				name: 'list-webhooks',
				arguments: {}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed).toHaveLength(1);
			expect(parsed[0].name).toBe('CI Webhook');
			expect(parsed[0].url).toBe('https://ci.example.com/hook');
		});
	});

	// ── create-webhook ──────────────────────────────────

	describe('create-webhook', () => {
		it('should return error when project not found', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'create-webhook',
				arguments: { name: 'Hook', url: 'https://example.com/hook' }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Project not found');
		});

		it('should create a webhook', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockInsertReturning(mockDb, [sampleWebhook]);

			const result = await client.callTool({
				name: 'create-webhook',
				arguments: { name: 'CI Webhook', url: 'https://ci.example.com/hook', events: ['run.completed'] }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('CI Webhook');
			expect(parsed.url).toBe('https://ci.example.com/hook');
			expect(parsed.events).toEqual(['run.completed']);
		});
	});

	// ── delete-webhook ──────────────────────────────────

	describe('delete-webhook', () => {
		it('should delete a webhook', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValue(sampleWebhook);

			const result = await client.callTool({
				name: 'delete-webhook',
				arguments: { webhookId: 1 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.deletedId).toBe(1);
			expect(mockDb.delete).toHaveBeenCalledTimes(1);
		});

		it('should return error when webhook not found', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'delete-webhook',
				arguments: { webhookId: 999 }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Webhook not found');
		});
	});

	// ── update-webhook ──────────────────────────────────

	describe('update-webhook', () => {
		it('should update a webhook', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValue(sampleWebhook);
			mockUpdateReturning(mockDb, [{ ...sampleWebhook, name: 'Updated Hook', enabled: false }]);

			const result = await client.callTool({
				name: 'update-webhook',
				arguments: { webhookId: 1, name: 'Updated Hook', enabled: false }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('Updated Hook');
			expect(parsed.enabled).toBe(false);
		});

		it('should return error when webhook not found', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'update-webhook',
				arguments: { webhookId: 999, name: 'Updated' }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Webhook not found');
		});
	});
});
