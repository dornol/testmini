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

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	project: { id: 'id', createdBy: 'created_by' },
	testCycle: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		cycleNumber: 'cycle_number',
		status: 'status',
		startDate: 'start_date',
		endDate: 'end_date',
		createdBy: 'created_by',
		createdAt: 'created_at',
		updatedAt: 'updated_at'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	sql: vi.fn()
}));
vi.mock('../helpers', async () => {
	const actual = (await vi.importActual('../helpers')) as Record<string, unknown>;
	return { ...actual };
});

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const { registerTestCycleTools } = await import('./test-cycles');

const PROJECT_ID = 1;

type ContentArray = Array<{ type: string; text: string }>;
function parseResult(result: unknown) {
	const toolResult = result as { content?: unknown };
	return JSON.parse(((result as { content?: unknown }).content as ContentArray)[0].text);
}

async function createClient() {
	const server = new McpServer({ name: 'test', version: '1.0.0' });
	registerTestCycleTools(server, PROJECT_ID);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: 'test-client', version: '1.0.0' });
	await client.connect(clientTransport);
	return { client, close: () => clientTransport.close() };
}

const sampleCycle = {
	id: 1,
	projectId: 1,
	name: 'Cycle 1',
	cycleNumber: 1,
	status: 'ACTIVE',
	startDate: new Date('2025-01-01'),
	endDate: new Date('2025-01-31'),
	createdBy: 'user-1',
	createdAt: new Date('2025-01-01'),
	updatedAt: new Date('2025-01-01')
};

describe('MCP test cycle tools', () => {
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

	// ── list-test-cycles ─────────────────────────────────

	describe('list-test-cycles', () => {
		it('should return test cycles', async () => {
			mockDb.query.testCycle.findMany!.mockResolvedValue([sampleCycle]);

			const result = await client.callTool({
				name: 'list-test-cycles',
				arguments: {}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed).toHaveLength(1);
			expect(parsed[0].name).toBe('Cycle 1');
		});
	});

	// ── create-test-cycle ────────────────────────────────

	describe('create-test-cycle', () => {
		it('should create a test cycle', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			// First select: max cycle number
			mockSelectResult(mockDb, [{ maxNum: 0 }]);
			const insertChain = mockInsertReturning(mockDb, [sampleCycle]);

			const result = await client.callTool({
				name: 'create-test-cycle',
				arguments: { name: ' Cycle 1 ', startDate: '2025-01-01', endDate: '2025-01-31' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('Cycle 1');
			expect(insertChain.values).toHaveBeenCalledWith(
				expect.objectContaining({
					name: 'Cycle 1',
					cycleNumber: 1,
					status: 'PLANNED',
					startDate: new Date('2025-01-01'),
					endDate: new Date('2025-01-31')
				})
			);
		});

		it('should reject blank names after trimming', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockSelectResult(mockDb, [{ maxNum: 0 }]);

			const result = await client.callTool({
				name: 'create-test-cycle',
				arguments: { name: '   ' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toContain(
				'Too small'
			);
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should reject invalid create dates', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockSelectResult(mockDb, [{ maxNum: 0 }]);

			const result = await client.callTool({
				name: 'create-test-cycle',
				arguments: { name: 'Cycle 1', startDate: 'not-a-date' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toContain(
				'Invalid date'
			);
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should return error when test cycle insert returns no row', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockSelectResult(mockDb, [{ maxNum: 0 }]);
			mockInsertReturning(mockDb, []);

			const result = await client.callTool({
				name: 'create-test-cycle',
				arguments: { name: 'Cycle 1' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Failed to create test cycle'
			);
		});

		it('should reject create date ranges where end is before start', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockSelectResult(mockDb, [{ maxNum: 0 }]);

			const result = await client.callTool({
				name: 'create-test-cycle',
				arguments: { name: 'Cycle 1', startDate: '2025-02-01', endDate: '2025-01-31' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toContain(
				'endDate must be on or after startDate'
			);
			expect(mockDb.insert).not.toHaveBeenCalled();
		});
	});

	// ── delete-test-cycle ────────────────────────────────

	describe('delete-test-cycle', () => {
		it('should delete successfully', async () => {
			mockDb.query.testCycle.findFirst.mockResolvedValue(sampleCycle);
			mockDeleteReturning(mockDb, [{ id: 1 }]);

			const result = await client.callTool({
				name: 'delete-test-cycle',
				arguments: { testCycleId: 1 }
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
			mockDb.query.testCycle.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'delete-test-cycle',
				arguments: { testCycleId: 999 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Test cycle not found'
			);
		});

		it('should return error when test cycle disappears before delete', async () => {
			mockDb.query.testCycle.findFirst.mockResolvedValue(sampleCycle);
			mockDeleteReturning(mockDb, []);

			const result = await client.callTool({
				name: 'delete-test-cycle',
				arguments: { testCycleId: 1 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Test cycle not found'
			);
		});

		it('should reject invalid IDs before deleting', async () => {
			const result = await client.callTool({
				name: 'delete-test-cycle',
				arguments: { testCycleId: -1 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toContain(
				'Too small'
			);
			expect(mockDb.query.testCycle.findFirst).not.toHaveBeenCalled();
			expect(mockDb.delete).not.toHaveBeenCalled();
		});
	});

	// ── update-test-cycle ───────────────────────────────

	describe('update-test-cycle', () => {
		it('should update a test cycle', async () => {
			mockDb.query.testCycle.findFirst.mockResolvedValue(sampleCycle);
			const updateChain = mockUpdateReturning(mockDb, [
				{ ...sampleCycle, name: 'Updated Cycle', status: 'COMPLETED' }
			]);

			const result = await client.callTool({
				name: 'update-test-cycle',
				arguments: { testCycleId: 1, name: ' Updated Cycle ', status: 'COMPLETED' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('Updated Cycle');
			expect(parsed.status).toBe('COMPLETED');
			expect(updateChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 1],
					['project_id', 1]
				])
			);
			expect(updateChain.set).toHaveBeenCalledWith({
				name: 'Updated Cycle',
				status: 'COMPLETED'
			});
		});

		it('should return error when not found', async () => {
			mockDb.query.testCycle.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'update-test-cycle',
				arguments: { testCycleId: 999, name: 'Updated' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Test cycle not found'
			);
		});

		it('should return error when test cycle disappears before update', async () => {
			mockDb.query.testCycle.findFirst.mockResolvedValue(sampleCycle);
			mockUpdateReturning(mockDb, []);

			const result = await client.callTool({
				name: 'update-test-cycle',
				arguments: { testCycleId: 1, name: 'Updated' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Test cycle not found'
			);
		});

		it('should reject invalid IDs before updating', async () => {
			const result = await client.callTool({
				name: 'update-test-cycle',
				arguments: { testCycleId: -1, name: 'Updated' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toContain(
				'Too small'
			);
			expect(mockDb.query.testCycle.findFirst).not.toHaveBeenCalled();
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should reject invalid update status', async () => {
			mockDb.query.testCycle.findFirst.mockResolvedValue(sampleCycle);

			const result = await client.callTool({
				name: 'update-test-cycle',
				arguments: { testCycleId: 1, status: 'ACTIVE' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toContain(
				'Invalid option'
			);
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should reject invalid update dates', async () => {
			mockDb.query.testCycle.findFirst.mockResolvedValue(sampleCycle);

			const result = await client.callTool({
				name: 'update-test-cycle',
				arguments: { testCycleId: 1, startDate: 'not-a-date' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toContain(
				'Invalid date'
			);
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should reject empty updates', async () => {
			mockDb.query.testCycle.findFirst.mockResolvedValue(sampleCycle);

			const result = await client.callTool({
				name: 'update-test-cycle',
				arguments: { testCycleId: 1 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toContain(
				'No fields to update'
			);
			expect(mockDb.update).not.toHaveBeenCalled();
		});
	});
});
