import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	createMockDb,
	mockInsertReturning,
	mockUpdateReturning
} from '$lib/server/test-helpers/mock-db';
import { sampleProject, sampleRelease } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	project: { id: 'id', createdBy: 'created_by' },
	release: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		version: 'version',
		status: 'status',
		description: 'description',
		releaseDate: 'release_date',
		createdBy: 'created_by',
		createdAt: 'created_at',
		updatedAt: 'updated_at'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args)
}));
vi.mock('../helpers', async () => {
	const actual = (await vi.importActual('../helpers')) as Record<string, unknown>;
	return { ...actual };
});

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const { registerReleaseTools } = await import('./releases');

const PROJECT_ID = 1;

type ContentArray = Array<{ type: string; text: string }>;
function parseResult(result: unknown) {
	const toolResult = result as { content?: unknown };
	return JSON.parse(((result as { content?: unknown }).content as ContentArray)[0].text);
}

async function createClient() {
	const server = new McpServer({ name: 'test', version: '1.0.0' });
	registerReleaseTools(server, PROJECT_ID);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: 'test-client', version: '1.0.0' });
	await client.connect(clientTransport);
	return { client, close: () => clientTransport.close() };
}

describe('MCP release tools', () => {
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

	// ── list-releases ────────────────────────────────────

	describe('list-releases', () => {
		it('should return releases', async () => {
			mockDb.query.release.findMany!.mockResolvedValue([sampleRelease]);

			const result = await client.callTool({
				name: 'list-releases',
				arguments: {}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed).toHaveLength(1);
			expect(parsed[0].name).toBe('v1.0.0');
		});
	});

	// ── create-release ───────────────────────────────────

	describe('create-release', () => {
		it('should create a release', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			const insertChain = mockInsertReturning(mockDb, [sampleRelease]);

			const result = await client.callTool({
				name: 'create-release',
				arguments: {
					name: ' v1.0.0 ',
					version: ' 1.0.0 ',
					description: ' First release ',
					releaseDate: '2025-02-01'
				}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.name).toBe('v1.0.0');
			expect(parsed.version).toBe('1.0.0');
			expect(insertChain.values).toHaveBeenCalledWith(
				expect.objectContaining({
					name: 'v1.0.0',
					version: '1.0.0',
					description: 'First release',
					status: 'PLANNING',
					releaseDate: new Date('2025-02-01')
				})
			);
		});

		it('should reject blank release names after trimming', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);

			const result = await client.callTool({
				name: 'create-release',
				arguments: { name: '   ' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toContain(
				'Too small'
			);
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should reject invalid release dates before insert', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);

			const result = await client.callTool({
				name: 'create-release',
				arguments: { name: 'v1.0.0', releaseDate: 'not-a-date' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toContain(
				'Invalid date'
			);
			expect(mockDb.insert).not.toHaveBeenCalled();
		});
	});

	// ── update-release ───────────────────────────────────

	describe('update-release', () => {
		it('should update a release', async () => {
			mockDb.query.release.findFirst.mockResolvedValue(sampleRelease);
			const updatedRelease = { ...sampleRelease, status: 'RELEASED' };
			const updateChain = mockUpdateReturning(mockDb, [updatedRelease]);

			const result = await client.callTool({
				name: 'update-release',
				arguments: { releaseId: 300, status: 'RELEASED', releaseDate: '2025-03-01' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.status).toBe('RELEASED');
			expect(updateChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 300],
					['project_id', 1]
				])
			);
			expect(updateChain.set).toHaveBeenCalledWith({
				status: 'RELEASED',
				releaseDate: new Date('2025-03-01')
			});
		});

		it('should reject invalid update dates before update', async () => {
			mockDb.query.release.findFirst.mockResolvedValue(sampleRelease);

			const result = await client.callTool({
				name: 'update-release',
				arguments: { releaseId: 300, releaseDate: 'not-a-date' }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toContain(
				'Invalid date'
			);
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should clear release date when update receives an empty string', async () => {
			mockDb.query.release.findFirst.mockResolvedValue(sampleRelease);
			const updatedRelease = { ...sampleRelease, releaseDate: null };
			const updateChain = mockUpdateReturning(mockDb, [updatedRelease]);

			const result = await client.callTool({
				name: 'update-release',
				arguments: { releaseId: 300, releaseDate: '' }
			});

			expect(result.isError).toBeFalsy();
			expect(updateChain.set).toHaveBeenCalledWith({ releaseDate: null });
		});

		it('should reject empty updates', async () => {
			mockDb.query.release.findFirst.mockResolvedValue(sampleRelease);

			const result = await client.callTool({
				name: 'update-release',
				arguments: { releaseId: 300 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toContain(
				'No fields to update'
			);
			expect(mockDb.update).not.toHaveBeenCalled();
		});
	});

	// ── delete-release ───────────────────────────────────

	describe('delete-release', () => {
		it('should delete successfully', async () => {
			mockDb.query.release.findFirst.mockResolvedValue(sampleRelease);

			const result = await client.callTool({
				name: 'delete-release',
				arguments: { releaseId: 300 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.success).toBe(true);
			expect(parsed.deletedId).toBe(300);
			expect(mockDb.delete).toHaveBeenCalledTimes(1);
			const deleteChain = mockDb.delete.mock.results[0]?.value as {
				where: ReturnType<typeof vi.fn>;
			};
			expect(deleteChain.where).toHaveBeenCalledWith(
				expect.arrayContaining([
					['id', 300],
					['project_id', 1]
				])
			);
		});

		it('should return error when not found', async () => {
			mockDb.query.release.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'delete-release',
				arguments: { releaseId: 999 }
			});

			expect(result.isError).toBe(true);
			expect(((result as { content?: unknown }).content as ContentArray)[0].text).toBe(
				'Release not found'
			);
		});
	});
});
