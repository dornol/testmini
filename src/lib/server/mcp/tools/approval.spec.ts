import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { sampleProject, sampleTestCase } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	project: { id: 'id', createdBy: 'created_by' },
	testCase: { id: 'id', projectId: 'project_id', key: 'key', approvalStatus: 'approval_status' },
	approvalHistory: { id: 'id', testCaseId: 'test_case_id', fromStatus: 'from_status', toStatus: 'to_status', comment: 'comment', userId: 'user_id', createdAt: 'created_at' }
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

const { registerApprovalTools } = await import('./approval');

const PROJECT_ID = 1;

type ContentArray = Array<{ type: string; text: string }>;
function parseResult(result: { content?: unknown }) {
	return JSON.parse((result.content as ContentArray)[0].text);
}

async function createClient() {
	const server = new McpServer({ name: 'test', version: '1.0.0' });
	registerApprovalTools(server, PROJECT_ID);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: 'test-client', version: '1.0.0' });
	await client.connect(clientTransport);
	return { client, close: () => clientTransport.close() };
}

describe('MCP approval tools', () => {
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

	// ── update-approval-status ───────────────────────────

	describe('update-approval-status', () => {
		it('should update approval status from DRAFT to IN_REVIEW', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue({ ...sampleTestCase, approvalStatus: 'DRAFT' });
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const tx = {
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								then: (resolve: (v: unknown) => void) => Promise.resolve(undefined).then(resolve)
							})
						})
					}),
					insert: vi.fn().mockReturnValue({
						values: vi.fn().mockReturnValue({
							then: (resolve: (v: unknown) => void) => Promise.resolve(undefined).then(resolve)
						})
					})
				};
				return fn(tx);
			});

			const result = await client.callTool({
				name: 'update-approval-status',
				arguments: { testCaseId: 10, toStatus: 'IN_REVIEW', comment: 'Ready for review' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.testCaseId).toBe(10);
			expect(parsed.fromStatus).toBe('DRAFT');
			expect(parsed.toStatus).toBe('IN_REVIEW');
		});

		it('should return error when test case not found', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'update-approval-status',
				arguments: { testCaseId: 999, toStatus: 'IN_REVIEW' }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Test case not found');
		});
	});
});
