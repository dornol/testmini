import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockDb, mockSelectResult, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { sampleProject, sampleTestCase, sampleTestCaseVersion } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockFindTestCaseWithLatestVersion = vi.fn();

vi.mock('$lib/server/db', () => ({
	db: mockDb,
	findTestCaseWithLatestVersion: mockFindTestCaseWithLatestVersion
}));
vi.mock('$lib/server/db/schema', () => ({
	project: { id: 'id', createdBy: 'created_by' },
	testCase: { id: 'id', projectId: 'project_id', key: 'key', latestVersionId: 'latest_version_id', sortOrder: 'sort_order', groupId: 'group_id', createdBy: 'created_by' },
	testCaseVersion: { id: 'id', testCaseId: 'test_case_id', title: 'title', priority: 'priority', versionNo: 'version_no', precondition: 'precondition', steps: 'steps', expectedResult: 'expected_result', updatedBy: 'updated_by' },
	tag: { id: 'id', projectId: 'project_id', name: 'name', color: 'color' },
	testCaseTag: { testCaseId: 'test_case_id', tagId: 'tag_id' }
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

const { registerTestCaseTools } = await import('./test-cases');

const PROJECT_ID = 1;

type ContentArray = Array<{ type: string; text: string }>;
function parseResult(result: { content?: unknown }) {
	return JSON.parse((result.content as ContentArray)[0].text);
}

async function createClient() {
	const server = new McpServer({ name: 'test', version: '1.0.0' });
	registerTestCaseTools(server, PROJECT_ID);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: 'test-client', version: '1.0.0' });
	await client.connect(clientTransport);
	return { client, close: () => clientTransport.close() };
}

describe('MCP test-case tools', () => {
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

	// ── search-test-cases ────────────────────────────────

	describe('search-test-cases', () => {
		it('should return matching test cases', async () => {
			mockSelectResult(mockDb, [
				{ id: 10, key: 'TC-0001', title: 'Login test', priority: 'HIGH' }
			]);

			const result = await client.callTool({ name: 'search-test-cases', arguments: { query: 'login' } });

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed).toHaveLength(1);
			expect(parsed[0].key).toBe('TC-0001');
		});

		it('should return empty array for no matches', async () => {
			mockSelectResult(mockDb, []);

			const result = await client.callTool({ name: 'search-test-cases', arguments: { query: 'xyz' } });

			const parsed = parseResult(result);
			expect(parsed).toEqual([]);
		});

		it('should respect limit parameter', async () => {
			mockSelectResult(mockDb, []);

			await client.callTool({ name: 'search-test-cases', arguments: { query: 'test', limit: 5 } });

			expect(mockDb.select).toHaveBeenCalled();
		});
	});

	// ── get-test-case ────────────────────────────────────

	describe('get-test-case', () => {
		it('should return test case by ID with tags', async () => {
			mockFindTestCaseWithLatestVersion.mockResolvedValue({
				...sampleTestCase,
				latestVersion: sampleTestCaseVersion
			});
			mockSelectResult(mockDb, [{ name: 'smoke', color: '#ff0000' }]);

			const result = await client.callTool({ name: 'get-test-case', arguments: { id: 10 } });

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.key).toBe('TC-0001');
			expect(parsed.tags).toHaveLength(1);
			expect(parsed.tags[0].name).toBe('smoke');
		});

		it('should return test case by key', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(sampleTestCase);
			mockFindTestCaseWithLatestVersion.mockResolvedValue({
				...sampleTestCase,
				latestVersion: sampleTestCaseVersion
			});
			mockSelectResult(mockDb, []);

			const result = await client.callTool({ name: 'get-test-case', arguments: { key: 'TC-0001' } });

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.key).toBe('TC-0001');
		});

		it('should return error when not found', async () => {
			mockFindTestCaseWithLatestVersion.mockResolvedValue(null);

			const result = await client.callTool({ name: 'get-test-case', arguments: { id: 999 } });

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Test case not found');
		});
	});

	// ── create-test-case ─────────────────────────────────

	describe('create-test-case', () => {
		it('should create test case with generated key', async () => {
			mockSelectResult(mockDb, [{ maxKey: 'TC-0003' }]);
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);

			const createdTc = { id: 14, projectId: 1, key: 'TC-0004', createdBy: 'user-1', sortOrder: 4 };
			const createdVersion = { id: 140, testCaseId: 14, versionNo: 1, title: 'New test', priority: 'MEDIUM' };

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
				name: 'create-test-case',
				arguments: { title: 'New test' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.key).toBe('TC-0004');
			expect(parsed.latestVersion.title).toBe('New test');
		});

		it('should return error when project not found', async () => {
			mockSelectResult(mockDb, [{ maxKey: null }]);
			mockDb.query.project.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'create-test-case',
				arguments: { title: 'Test' }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Project not found');
		});
	});

	// ── update-test-case ─────────────────────────────────

	describe('update-test-case', () => {
		it('should create new version when updating', async () => {
			mockFindTestCaseWithLatestVersion.mockResolvedValue({
				...sampleTestCase,
				latestVersion: sampleTestCaseVersion
			});
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);

			const updatedVersion = { ...sampleTestCaseVersion, id: 101, versionNo: 2, title: 'Updated' };
			mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txUpdateChain = {
					set: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					then: (resolve: (v: unknown) => void) => Promise.resolve(undefined).then(resolve)
				};
				const tx = {
					insert: vi.fn().mockImplementation(() => ({
						values: vi.fn().mockReturnThis(),
						returning: vi.fn().mockReturnThis(),
						then: (resolve: (v: unknown) => void) => Promise.resolve([updatedVersion]).then(resolve)
					})),
					update: vi.fn().mockReturnValue(txUpdateChain)
				};
				return fn(tx);
			});

			const result = await client.callTool({
				name: 'update-test-case',
				arguments: { id: 10, title: 'Updated' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.latestVersion.title).toBe('Updated');
			expect(parsed.latestVersion.versionNo).toBe(2);
		});

		it('should return error when test case not found', async () => {
			mockFindTestCaseWithLatestVersion.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'update-test-case',
				arguments: { id: 999, title: 'Updated' }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Test case not found');
		});
	});

	// ── delete-test-case ─────────────────────────────────

	describe('delete-test-case', () => {
		it('should delete test case by ID', async () => {
			const result = await client.callTool({
				name: 'delete-test-case',
				arguments: { id: 10 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.deletedId).toBe(10);
		});

		it('should delete test case by key', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue({ id: 10 });

			const result = await client.callTool({
				name: 'delete-test-case',
				arguments: { key: 'TC-0001' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.deletedId).toBe(10);
		});

		it('should return error when not found by key', async () => {
			mockDb.query.testCase.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'delete-test-case',
				arguments: { key: 'TC-9999' }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Test case not found');
		});
	});
});
