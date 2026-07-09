import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	createMockDb,
	mockInsertReturning,
	mockSelectResult,
	mockUpdateReturning
} from '$lib/server/test-helpers/mock-db';
import { sampleProject } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	project: { id: 'id', createdBy: 'created_by' },
	module: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		description: 'description',
		parentModuleId: 'parent_module_id',
		sortOrder: 'sort_order',
		createdBy: 'created_by'
	},
	moduleTestCase: { moduleId: 'module_id', testCaseId: 'test_case_id', id: 'id' },
	testCase: { id: 'id', projectId: 'project_id' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	sql: vi.fn(),
	inArray: vi.fn((a: unknown, b: unknown) => [a, b])
}));
vi.mock('../helpers', async () => {
	const actual = (await vi.importActual('../helpers')) as Record<string, unknown>;
	return { ...actual };
});

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const { registerModuleTools } = await import('./modules');

const PROJECT_ID = 1;

type ContentArray = Array<{ type: string; text: string }>;
function parseResult(result: unknown) {
	const toolResult = result as { content?: unknown };
	return JSON.parse(((result as { content?: unknown }).content as ContentArray)[0].text);
}

async function createClient() {
	const server = new McpServer({ name: 'test', version: '1.0.0' });
	registerModuleTools(server, PROJECT_ID);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: 'test-client', version: '1.0.0' });
	await client.connect(clientTransport);
	return { client, close: () => clientTransport.close() };
}

const sampleModule = {
	id: 1,
	projectId: 1,
	name: 'Auth Module',
	description: 'Authentication tests',
	parentModuleId: null,
	sortOrder: 0,
	createdBy: 'user-1',
	createdAt: new Date('2025-01-01')
};

describe('MCP module tools', () => {
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

	// ── list-modules ─────────────────────────────────────

	describe('list-modules', () => {
		it('should return modules', async () => {
			mockDb.query.module.findMany!.mockResolvedValue([sampleModule]);

			const result = await client.callTool({
				name: 'list-modules',
				arguments: {}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed).toHaveLength(1);
			expect(parsed[0].name).toBe('Auth Module');
		});
	});

	// ── create-module ────────────────────────────────────

	describe('create-module', () => {
		it('should return error when parent module not found', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockDb.query.module.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'create-module',
				arguments: { name: 'Sub Module', parentModuleId: 999 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Parent module not found'
			);
		});

		it('should create a module', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockInsertReturning(mockDb, [sampleModule]);

			const result = await client.callTool({
				name: 'create-module',
				arguments: { name: 'Auth Module', description: 'Authentication tests' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('Auth Module');
		});
	});

	// ── delete-module ────────────────────────────────────

	describe('delete-module', () => {
		it('should delete successfully', async () => {
			mockDb.query.module.findFirst.mockResolvedValue(sampleModule);

			const result = await client.callTool({
				name: 'delete-module',
				arguments: { moduleId: 1 }
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

		it('should return error when not found', async () => {
			mockDb.query.module.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'delete-module',
				arguments: { moduleId: 999 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Module not found'
			);
		});
	});

	// ── get-module-coverage ──────────────────────────────

	describe('get-module-coverage', () => {
		it('should return coverage stats', async () => {
			const coverageData = [
				{ moduleId: 1, moduleName: 'Auth Module', testCaseCount: 5 },
				{ moduleId: 2, moduleName: 'API Module', testCaseCount: 3 }
			];
			mockSelectResult(mockDb, coverageData);

			const result = await client.callTool({
				name: 'get-module-coverage',
				arguments: {}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed).toHaveLength(2);
			expect(parsed[0].testCaseCount).toBe(5);
		});
	});

	// ── update-module ───────────────────────────────────

	describe('update-module', () => {
		it('should update name and description', async () => {
			mockDb.query.module.findFirst.mockResolvedValue(sampleModule);
			const updateChain = mockUpdateReturning(mockDb, [
				{ ...sampleModule, name: 'Updated Module', description: 'New desc' }
			]);

			const result = await client.callTool({
				name: 'update-module',
				arguments: { moduleId: 1, name: 'Updated Module', description: 'New desc' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('Updated Module');
			expect(parsed.description).toBe('New desc');
			expect(updateChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 1],
					['project_id', 1]
				])
			);
		});

		it('should return error when not found', async () => {
			mockDb.query.module.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'update-module',
				arguments: { moduleId: 999, name: 'Nope' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Module not found'
			);
		});
	});

	// ── add-module-test-cases ───────────────────────────

	describe('add-module-test-cases', () => {
		it('should add test cases to module', async () => {
			mockDb.query.module.findFirst.mockResolvedValue(sampleModule);
			mockSelectResult(mockDb, [{ id: 10 }, { id: 20 }]);
			mockInsertReturning(mockDb, []);

			const result = await client.callTool({
				name: 'add-module-test-cases',
				arguments: { moduleId: 1, testCaseIds: [10, 20] }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.moduleId).toBe(1);
			expect(parsed.addedCount).toBe(2);
		});

		it('should reject adding test cases outside the current project', async () => {
			mockDb.query.module.findFirst.mockResolvedValue(sampleModule);
			mockSelectResult(mockDb, [{ id: 10 }]);

			const result = await client.callTool({
				name: 'add-module-test-cases',
				arguments: { moduleId: 1, testCaseIds: [10, 999] }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Test case not found'
			);
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should reject duplicate test case IDs before querying the database', async () => {
			const result = await client.callTool({
				name: 'add-module-test-cases',
				arguments: { moduleId: 1, testCaseIds: [10, 10] }
			});

			expect(result.isError).toBe(true);
			expect(mockDb.query.module.findFirst).not.toHaveBeenCalled();
			expect(mockDb.select).not.toHaveBeenCalled();
			expect(mockDb.insert).not.toHaveBeenCalled();
		});
	});

	// ── remove-module-test-cases ────────────────────────

	describe('remove-module-test-cases', () => {
		it('should remove test cases from module', async () => {
			mockDb.query.module.findFirst.mockResolvedValue(sampleModule);
			mockSelectResult(mockDb, [{ id: 10 }, { id: 20 }]);

			const result = await client.callTool({
				name: 'remove-module-test-cases',
				arguments: { moduleId: 1, testCaseIds: [10, 20] }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.moduleId).toBe(1);
			expect(parsed.removedCount).toBe(2);
		});

		it('should reject empty test case IDs before querying the database', async () => {
			const result = await client.callTool({
				name: 'remove-module-test-cases',
				arguments: { moduleId: 1, testCaseIds: [] }
			});

			expect(result.isError).toBe(true);
			expect(mockDb.query.module.findFirst).not.toHaveBeenCalled();
			expect(mockDb.delete).not.toHaveBeenCalled();
		});

		it('should reject removal when module is not in the current project', async () => {
			mockDb.query.module.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'remove-module-test-cases',
				arguments: { moduleId: 999, testCaseIds: [10] }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Module not found'
			);
			expect(mockDb.delete).not.toHaveBeenCalled();
		});

		it('should reject removing test cases outside the current project', async () => {
			mockDb.query.module.findFirst.mockResolvedValue(sampleModule);
			mockSelectResult(mockDb, []);

			const result = await client.callTool({
				name: 'remove-module-test-cases',
				arguments: { moduleId: 1, testCaseIds: [999] }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Test case not found'
			);
			expect(mockDb.delete).not.toHaveBeenCalled();
		});
	});
});
