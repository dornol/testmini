import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockDb, mockSelectResult, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { sampleProject } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	project: { id: 'id', createdBy: 'created_by' },
	issueLink: { id: 'id', projectId: 'project_id', testCaseId: 'test_case_id', testExecutionId: 'test_execution_id', externalUrl: 'external_url', externalKey: 'external_key', title: 'title', provider: 'provider', createdBy: 'created_by', createdAt: 'created_at' },
	testCase: { id: 'id', projectId: 'project_id' },
	testExecution: { id: 'id', testRunId: 'test_run_id' }
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

const { registerIssueLinkTools } = await import('./issue-links');

const PROJECT_ID = 1;

type ContentArray = Array<{ type: string; text: string }>;
function parseResult(result: { content?: unknown }) {
	return JSON.parse((result.content as ContentArray)[0].text);
}

async function createClient() {
	const server = new McpServer({ name: 'test', version: '1.0.0' });
	registerIssueLinkTools(server, PROJECT_ID);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: 'test-client', version: '1.0.0' });
	await client.connect(clientTransport);
	return { client, close: () => clientTransport.close() };
}

const sampleIssueLink = {
	id: 1,
	projectId: 1,
	testCaseId: 10,
	testExecutionId: null,
	externalUrl: 'https://jira.example.com/PROJ-123',
	externalKey: 'PROJ-123',
	title: 'Login button broken',
	provider: 'jira',
	createdBy: 'user-1',
	createdAt: new Date('2025-01-01')
};

describe('MCP issue-link tools', () => {
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

	// ── list-issue-links ────────────────────────────────

	describe('list-issue-links', () => {
		it('should return all issue links', async () => {
			mockSelectResult(mockDb, [sampleIssueLink, { ...sampleIssueLink, id: 2, externalKey: 'PROJ-456' }]);

			const result = await client.callTool({
				name: 'list-issue-links',
				arguments: {}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed).toHaveLength(2);
		});

		it('should filter by test case ID', async () => {
			mockSelectResult(mockDb, [sampleIssueLink]);

			const result = await client.callTool({
				name: 'list-issue-links',
				arguments: { testCaseId: 10 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed).toHaveLength(1);
			expect(parsed[0].externalKey).toBe('PROJ-123');
		});
	});

	// ── create-issue-link ───────────────────────────────

	describe('create-issue-link', () => {
		it('should create an issue link', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockInsertReturning(mockDb, [sampleIssueLink]);

			const result = await client.callTool({
				name: 'create-issue-link',
				arguments: {
					externalUrl: 'https://jira.example.com/PROJ-123',
					externalKey: 'PROJ-123',
					title: 'Login button broken',
					provider: 'jira',
					testCaseId: 10
				}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.externalKey).toBe('PROJ-123');
			expect(parsed.provider).toBe('jira');
		});

		it('should return error when project not found', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'create-issue-link',
				arguments: {
					externalUrl: 'https://jira.example.com/PROJ-123',
					provider: 'jira'
				}
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Project not found');
		});
	});
});
