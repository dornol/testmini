import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	createMockDb,
	mockDeleteReturning,
	mockInsertReturning,
	mockSelectResult,
	mockUpdateReturning
} from '$lib/server/test-helpers/mock-db';
import { sampleProject } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockValidatePublicHttpUrl = vi.fn();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	project: { id: 'id', createdBy: 'created_by' },
	projectWebhook: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		url: 'url',
		events: 'events',
		enabled: 'enabled',
		secret: 'secret',
		createdBy: 'created_by',
		createdAt: 'created_at'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args)
}));
vi.mock('$lib/server/url-safety', () => ({
	validatePublicHttpUrl: mockValidatePublicHttpUrl
}));
vi.mock('../helpers', async () => {
	const actual = (await vi.importActual('../helpers')) as Record<string, unknown>;
	return { ...actual };
});

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const { registerWebhookTools } = await import('./webhooks');

const PROJECT_ID = 1;

type ContentArray = Array<{ type: string; text: string }>;
function parseResult(result: unknown) {
	const toolResult = result as { content?: unknown };
	return JSON.parse(((result as { content?: unknown }).content as ContentArray)[0].text);
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
	events: ['TEST_RUN_COMPLETED'],
	enabled: true,
	secret: null,
	createdBy: 'user-1',
	createdAt: new Date('2025-01-01')
};

describe('MCP webhook tools', () => {
	let client: Client;
	let close: () => Promise<void>;

	beforeEach(async () => {
		vi.clearAllMocks();
		mockValidatePublicHttpUrl.mockResolvedValue({ ok: true });
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
				{
					id: 1,
					name: 'CI Webhook',
					url: 'https://ci.example.com/hook',
					events: ['run.completed'],
					enabled: true,
					createdAt: new Date('2025-01-01')
				}
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
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Project not found'
			);
		});

		it('should create a webhook', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			const insertChain = mockInsertReturning(mockDb, [sampleWebhook]);

			const result = await client.callTool({
				name: 'create-webhook',
				arguments: {
					name: 'CI Webhook',
					url: 'https://ci.example.com/hook',
					events: ['TEST_RUN_COMPLETED']
				}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('CI Webhook');
			expect(parsed.url).toBe('https://ci.example.com/hook');
			expect(parsed.events).toEqual(['TEST_RUN_COMPLETED']);
			expect(parsed.secret).toBeUndefined();
			expect(insertChain.values).toHaveBeenCalledWith({
				projectId: 1,
				name: 'CI Webhook',
				url: 'https://ci.example.com/hook',
				events: ['TEST_RUN_COMPLETED'],
				secret: null,
				createdBy: sampleProject.createdBy
			});
		});

		it('should trim secret and not return it after create', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			const insertChain = mockInsertReturning(mockDb, [
				{ ...sampleWebhook, secret: 'stored-secret' }
			]);

			const result = await client.callTool({
				name: 'create-webhook',
				arguments: {
					name: '  CI Webhook  ',
					url: 'https://ci.example.com/hook',
					events: ['TEST_FAILED'],
					secret: '  stored-secret  '
				}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.secret).toBeUndefined();
			expect(insertChain.values).toHaveBeenCalledWith(
				expect.objectContaining({
					name: 'CI Webhook',
					secret: 'stored-secret'
				})
			);
		});

		it('should reject private webhook URLs', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockValidatePublicHttpUrl.mockResolvedValue({
				ok: false,
				error: 'URL resolves to a private or reserved IP address'
			});
			const insertCallCount = mockDb.insert.mock.calls.length;

			const result = await client.callTool({
				name: 'create-webhook',
				arguments: { name: 'Hook', url: 'http://127.0.0.1:9000/hook' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'URL resolves to a private or reserved IP address'
			);
			expect(mockDb.insert).toHaveBeenCalledTimes(insertCallCount);
		});

		it('should reject webhook URLs with embedded credentials before URL safety lookup', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			const insertCallCount = mockDb.insert.mock.calls.length;

			const result = await client.callTool({
				name: 'create-webhook',
				arguments: {
					name: 'Hook',
					url: 'https://user:token@ci.example.com/hook'
				}
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'URL must not include credentials'
			);
			expect(mockValidatePublicHttpUrl).not.toHaveBeenCalled();
			expect(mockDb.insert).toHaveBeenCalledTimes(insertCallCount);
		});

		it('should reject unknown events', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			const insertCallCount = mockDb.insert.mock.calls.length;

			const result = await client.callTool({
				name: 'create-webhook',
				arguments: {
					name: 'Hook',
					url: 'https://ci.example.com/hook',
					events: ['run.completed']
				}
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Invalid event type: run.completed'
			);
			expect(mockDb.insert).toHaveBeenCalledTimes(insertCallCount);
		});

		it('should reject duplicate events', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			const insertCallCount = mockDb.insert.mock.calls.length;

			const result = await client.callTool({
				name: 'create-webhook',
				arguments: {
					name: 'Hook',
					url: 'https://ci.example.com/hook',
					events: ['TEST_FAILED', 'TEST_FAILED']
				}
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Duplicate event type: TEST_FAILED'
			);
			expect(mockDb.insert).toHaveBeenCalledTimes(insertCallCount);
		});

		it('should reject control characters in webhook names before insert', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			const insertCallCount = mockDb.insert.mock.calls.length;

			const result = await client.callTool({
				name: 'create-webhook',
				arguments: {
					name: 'Hook\nName',
					url: 'https://ci.example.com/hook'
				}
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Name must not contain control characters'
			);
			expect(mockDb.insert).toHaveBeenCalledTimes(insertCallCount);
		});

		it('should reject overlong secrets', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			const insertCallCount = mockDb.insert.mock.calls.length;

			const result = await client.callTool({
				name: 'create-webhook',
				arguments: {
					name: 'Hook',
					url: 'https://ci.example.com/hook',
					secret: 's'.repeat(4001)
				}
			});

			expect(result.isError).toBe(true);
			expect(mockDb.insert).toHaveBeenCalledTimes(insertCallCount);
		});

		it('should return error when webhook insert returns no row', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockInsertReturning(mockDb, []);

			const result = await client.callTool({
				name: 'create-webhook',
				arguments: { name: 'Hook', url: 'https://ci.example.com/hook' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Failed to create webhook'
			);
		});
	});

	// ── delete-webhook ──────────────────────────────────

	describe('delete-webhook', () => {
		it('should delete a webhook', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValue(sampleWebhook);
			mockDeleteReturning(mockDb, [{ id: 1 }]);

			const result = await client.callTool({
				name: 'delete-webhook',
				arguments: { webhookId: 1 }
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

		it('should return error when webhook not found', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'delete-webhook',
				arguments: { webhookId: 999 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Webhook not found'
			);
		});

		it('should reject invalid IDs before deleting', async () => {
			const result = await client.callTool({
				name: 'delete-webhook',
				arguments: { webhookId: -1 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toContain(
				'Too small'
			);
			expect(mockDb.query.projectWebhook.findFirst).not.toHaveBeenCalled();
			expect(mockDb.delete).not.toHaveBeenCalled();
		});

		it('should return error when webhook disappears before delete', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValue(sampleWebhook);
			mockDeleteReturning(mockDb, []);

			const result = await client.callTool({
				name: 'delete-webhook',
				arguments: { webhookId: 1 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Webhook not found'
			);
		});
	});

	// ── update-webhook ──────────────────────────────────

	describe('update-webhook', () => {
		it('should update a webhook', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValue(sampleWebhook);
			const updateChain = mockUpdateReturning(mockDb, [
				{ ...sampleWebhook, name: 'Updated Hook', enabled: false, secret: 'hidden' }
			]);

			const result = await client.callTool({
				name: 'update-webhook',
				arguments: { webhookId: 1, name: 'Updated Hook', enabled: false }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('Updated Hook');
			expect(parsed.enabled).toBe(false);
			expect(parsed.secret).toBeUndefined();
			expect(updateChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 1],
					['project_id', 1]
				])
			);
		});

		it('should return error when webhook not found', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'update-webhook',
				arguments: { webhookId: 999, name: 'Updated' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Webhook not found'
			);
		});

		it('should return error when webhook disappears before update', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValue(sampleWebhook);
			mockUpdateReturning(mockDb, []);

			const result = await client.callTool({
				name: 'update-webhook',
				arguments: { webhookId: 1, name: 'Updated Hook' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Webhook not found'
			);
		});

		it('should reject invalid IDs before updating', async () => {
			const result = await client.callTool({
				name: 'update-webhook',
				arguments: { webhookId: -1, name: 'Updated' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toContain(
				'Too small'
			);
			expect(mockDb.query.projectWebhook.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should reject webhook update URLs with embedded credentials before updating', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValue(sampleWebhook);
			const updateCallCount = mockDb.update.mock.calls.length;

			const result = await client.callTool({
				name: 'update-webhook',
				arguments: {
					webhookId: 1,
					url: 'https://user:token@ci.example.com/hook'
				}
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'URL must not include credentials'
			);
			expect(mockValidatePublicHttpUrl).not.toHaveBeenCalled();
			expect(mockDb.update).toHaveBeenCalledTimes(updateCallCount);
		});

		it('should validate URLs before updating a webhook', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValue(sampleWebhook);
			mockValidatePublicHttpUrl.mockResolvedValue({ ok: false, error: 'Invalid URL' });
			const updateCallCount = mockDb.update.mock.calls.length;

			const result = await client.callTool({
				name: 'update-webhook',
				arguments: { webhookId: 1, url: 'http://localhost/hook' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Invalid URL'
			);
			expect(mockDb.update).toHaveBeenCalledTimes(updateCallCount);
		});

		it('should reject duplicate events before updating a webhook', async () => {
			mockDb.query.projectWebhook.findFirst.mockResolvedValue(sampleWebhook);
			const updateCallCount = mockDb.update.mock.calls.length;

			const result = await client.callTool({
				name: 'update-webhook',
				arguments: {
					webhookId: 1,
					events: ['COMMENT_ADDED', 'COMMENT_ADDED']
				}
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Duplicate event type: COMMENT_ADDED'
			);
			expect(mockDb.update).toHaveBeenCalledTimes(updateCallCount);
		});
	});
});
