import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	notification: {
		id: 'id',
		userId: 'user_id',
		type: 'type',
		title: 'title',
		message: 'message',
		link: 'link',
		projectId: 'project_id',
		isRead: 'is_read',
		createdAt: 'created_at'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	desc: vi.fn((a: unknown) => a)
}));
vi.mock('../helpers', async () => {
	const actual = (await vi.importActual('../helpers')) as Record<string, unknown>;
	return { ...actual };
});

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const { registerNotificationTools } = await import('./notifications');

const PROJECT_ID = 1;

type ContentArray = Array<{ type: string; text: string }>;
function parseResult(result: unknown) {
	const toolResult = result as { content?: unknown };
	return JSON.parse(((result as { content?: unknown }).content as ContentArray)[0].text);
}

async function createClient() {
	const server = new McpServer({ name: 'test', version: '1.0.0' });
	registerNotificationTools(server, PROJECT_ID);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: 'test-client', version: '1.0.0' });
	await client.connect(clientTransport);
	return { client, close: () => clientTransport.close() };
}

const sampleNotification = {
	id: 1,
	type: 'run_completed',
	title: 'Test Run Completed',
	message: 'Sprint 1 Run finished',
	link: '/projects/1/runs/50',
	isRead: false,
	createdAt: new Date('2025-01-01')
};

describe('MCP notification tools', () => {
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

	// ── list-notifications ──────────────────────────────

	describe('list-notifications', () => {
		it('should return notifications with default limit', async () => {
			mockSelectResult(mockDb, [sampleNotification]);

			const result = await client.callTool({
				name: 'list-notifications',
				arguments: {}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed).toHaveLength(1);
			expect(parsed[0].title).toBe('Test Run Completed');
			expect(parsed[0].isRead).toBe(false);
		});

		it('should return empty list', async () => {
			mockSelectResult(mockDb, []);

			const result = await client.callTool({
				name: 'list-notifications',
				arguments: {}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed).toEqual([]);
		});

		it('should filter unread notifications', async () => {
			mockSelectResult(mockDb, [sampleNotification]);

			const result = await client.callTool({
				name: 'list-notifications',
				arguments: { unreadOnly: true }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed).toHaveLength(1);
		});

		it('should reject invalid limits before querying', async () => {
			const result = await client.callTool({
				name: 'list-notifications',
				arguments: { limit: 0 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toContain(
				'Too small'
			);
			expect(mockDb.select).not.toHaveBeenCalled();
		});
	});
});
