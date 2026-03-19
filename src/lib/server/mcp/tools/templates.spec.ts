import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockDb, mockSelectResult, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { sampleProject } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	project: { id: 'id', createdBy: 'created_by' },
	testCase: { id: 'id', projectId: 'project_id', key: 'key', latestVersionId: 'latest_version_id', sortOrder: 'sort_order', createdBy: 'created_by' },
	testCaseVersion: { id: 'id', testCaseId: 'test_case_id', title: 'title', priority: 'priority', versionNo: 'version_no', precondition: 'precondition', steps: 'steps', updatedBy: 'updated_by' },
	testCaseTemplate: { id: 'id', projectId: 'project_id', name: 'name', description: 'description', precondition: 'precondition', steps: 'steps', priority: 'priority', createdBy: 'created_by', createdAt: 'created_at', updatedAt: 'updated_at' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
		{ raw: (s: string) => s }
	),
	inArray: vi.fn((a: unknown, b: unknown) => [a, b])
}));

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const { registerTemplateTools } = await import('./templates');

const PROJECT_ID = 1;

type ContentArray = Array<{ type: string; text: string }>;
function parseResult(result: { content?: unknown }) {
	return JSON.parse((result.content as ContentArray)[0].text);
}

async function createClient() {
	const server = new McpServer({ name: 'test', version: '1.0.0' });
	registerTemplateTools(server, PROJECT_ID);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: 'test-client', version: '1.0.0' });
	await client.connect(clientTransport);
	return { client, close: () => clientTransport.close() };
}

const sampleTemplate = {
	id: 1,
	projectId: 1,
	name: 'Login Template',
	description: 'Template for login tests',
	precondition: 'User exists in DB',
	steps: [{ order: 1, action: 'Enter credentials', expected: 'Login success' }],
	priority: 'HIGH',
	createdBy: 'user-1',
	createdAt: new Date('2025-01-01'),
	updatedAt: new Date('2025-01-01')
};

describe('MCP template tools', () => {
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

	// ── get-template ─────────────────────────────────────

	describe('get-template', () => {
		it('should return template by ID', async () => {
			mockDb.query.testCaseTemplate.findFirst.mockResolvedValue(sampleTemplate);

			const result = await client.callTool({ name: 'get-template', arguments: { templateId: 1 } });

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('Login Template');
			expect(parsed.priority).toBe('HIGH');
		});

		it('should return error when not found', async () => {
			mockDb.query.testCaseTemplate.findFirst.mockResolvedValue(null);

			const result = await client.callTool({ name: 'get-template', arguments: { templateId: 999 } });

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Template not found');
		});
	});

	// ── create-template ──────────────────────────────────

	describe('create-template', () => {
		it('should create a template with steps', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockInsertReturning(mockDb, [sampleTemplate]);

			const result = await client.callTool({
				name: 'create-template',
				arguments: {
					name: 'Login Template',
					description: 'Template for login tests',
					priority: 'HIGH',
					steps: [{ action: 'Enter credentials', expected: 'Login success' }]
				}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('Login Template');
		});

		it('should return error when project not found', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'create-template',
				arguments: { name: 'Template' }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Project not found');
		});
	});

	// ── create-test-case-from-template ───────────────────

	describe('create-test-case-from-template', () => {
		it('should create a test case from template', async () => {
			mockDb.query.testCaseTemplate.findFirst.mockResolvedValue(sampleTemplate);
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockSelectResult(mockDb, [{ maxKey: 'TC-0005' }]);

			const createdTc = { id: 16, projectId: 1, key: 'TC-0006', createdBy: 'user-1', sortOrder: 6 };
			const createdVersion = { id: 160, testCaseId: 16, versionNo: 1, title: 'From template', priority: 'HIGH' };

			mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				let insertCallCount = 0;
				const txUpdateChain = {
					set: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					then: (resolve: (v: unknown) => void) => Promise.resolve(undefined).then(resolve)
				};
				const tx = {
					insert: vi.fn().mockImplementation(() => {
						insertCallCount++;
						return {
							values: vi.fn().mockReturnThis(),
							returning: vi.fn().mockReturnThis(),
							then: (resolve: (v: unknown) => void) =>
								Promise.resolve(insertCallCount === 1 ? [createdTc] : [createdVersion]).then(resolve)
						};
					}),
					update: vi.fn().mockReturnValue(txUpdateChain)
				};
				return fn(tx);
			});

			const result = await client.callTool({
				name: 'create-test-case-from-template',
				arguments: { templateId: 1, title: 'From template' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.key).toBe('TC-0006');
			expect(parsed.latestVersion.title).toBe('From template');
		});

		it('should return error when template not found', async () => {
			mockDb.query.testCaseTemplate.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'create-test-case-from-template',
				arguments: { templateId: 999, title: 'Test' }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Template not found');
		});

		it('should return error when project not found', async () => {
			mockDb.query.testCaseTemplate.findFirst.mockResolvedValue(sampleTemplate);
			mockDb.query.project.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'create-test-case-from-template',
				arguments: { templateId: 1, title: 'Test' }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Project not found');
		});
	});
});
