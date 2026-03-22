import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	auditLog: { id: 'id', userId: 'user_id', action: 'action', entityType: 'entity_type', entityId: 'entity_id', projectId: 'project_id', metadata: 'metadata', createdAt: 'created_at' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	desc: vi.fn((a: unknown) => a)
}));
vi.mock('../helpers', async () => {
	const actual = await vi.importActual('../helpers') as Record<string, unknown>;
	return { ...actual };
});

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const { registerAuditLogTools } = await import('./audit-logs');

const PROJECT_ID = 1;

type ContentArray = Array<{ type: string; text: string }>;
function parseResult(result: { content?: unknown }) {
	return JSON.parse((result.content as ContentArray)[0].text);
}

async function createClient() {
	const server = new McpServer({ name: 'test', version: '1.0.0' });
	registerAuditLogTools(server, PROJECT_ID);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: 'test-client', version: '1.0.0' });
	await client.connect(clientTransport);
	return { client, close: () => clientTransport.close() };
}

const sampleAuditLog = {
	id: 1,
	userId: 'user-1',
	action: 'test_case.created',
	entityType: 'test_case',
	entityId: '10',
	metadata: { title: 'Login should work' },
	createdAt: new Date('2025-01-01')
};

describe('MCP audit-log tools', () => {
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

	// ── list-audit-logs ─────────────────────────────────

	describe('list-audit-logs', () => {
		it('should return audit logs with default limit', async () => {
			mockSelectResult(mockDb, [sampleAuditLog]);

			const result = await client.callTool({
				name: 'list-audit-logs',
				arguments: {}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed).toHaveLength(1);
			expect(parsed[0].action).toBe('test_case.created');
			expect(parsed[0].entityType).toBe('test_case');
		});

		it('should return empty list', async () => {
			mockSelectResult(mockDb, []);

			const result = await client.callTool({
				name: 'list-audit-logs',
				arguments: {}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed).toEqual([]);
		});

		it('should filter by action', async () => {
			mockSelectResult(mockDb, [sampleAuditLog]);

			const result = await client.callTool({
				name: 'list-audit-logs',
				arguments: { action: 'test_case.created' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed).toHaveLength(1);
			expect(parsed[0].action).toBe('test_case.created');
		});
	});
});
