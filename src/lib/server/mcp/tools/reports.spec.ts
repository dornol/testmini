import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	project: { id: 'id', createdBy: 'created_by' },
	testCase: { id: 'id', projectId: 'project_id', riskImpact: 'risk_impact', riskLikelihood: 'risk_likelihood', riskLevel: 'risk_level' },
	testRun: { id: 'id', projectId: 'project_id', status: 'status', createdAt: 'created_at', finishedAt: 'finished_at', name: 'name', environment: 'environment' },
	testExecution: { id: 'id', testRunId: 'test_run_id', status: 'status', testCaseVersionId: 'test_case_version_id' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	count: vi.fn(),
	sql: vi.fn(),
	isNotNull: vi.fn((a: unknown) => a),
	inArray: vi.fn((a: unknown, b: unknown) => [a, b]),
	desc: vi.fn((a: unknown) => a)
}));
vi.mock('../helpers', async () => {
	const actual = await vi.importActual('../helpers') as Record<string, unknown>;
	return { ...actual };
});

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const { registerReportTools } = await import('./reports');

const PROJECT_ID = 1;

type ContentArray = Array<{ type: string; text: string }>;
function parseResult(result: { content?: unknown }) {
	return JSON.parse((result.content as ContentArray)[0].text);
}

async function createClient() {
	const server = new McpServer({ name: 'test', version: '1.0.0' });
	registerReportTools(server, PROJECT_ID);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: 'test-client', version: '1.0.0' });
	await client.connect(clientTransport);
	return { client, close: () => clientTransport.close() };
}

describe('MCP report tools', () => {
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

	// ── get-project-stats ────────────────────────────────

	describe('get-project-stats', () => {
		it('should return counts and passRate', async () => {
			// Sequential select mocks: tcCount, runCount, execCounts
			const chain1 = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), innerJoin: vi.fn().mockReturnThis(), groupBy: vi.fn().mockReturnThis(), then: (r: (v: unknown) => void) => Promise.resolve([{ tcCount: 5 }]).then(r) };
			const chain2 = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), innerJoin: vi.fn().mockReturnThis(), groupBy: vi.fn().mockReturnThis(), then: (r: (v: unknown) => void) => Promise.resolve([{ runCount: 3 }]).then(r) };
			const chain3 = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), innerJoin: vi.fn().mockReturnThis(), groupBy: vi.fn().mockReturnThis(), then: (r: (v: unknown) => void) => Promise.resolve([{ status: 'PASS', count: 10 }, { status: 'FAIL', count: 2 }]).then(r) };

			mockDb.select
				.mockReturnValueOnce(chain1 as never)
				.mockReturnValueOnce(chain2 as never)
				.mockReturnValueOnce(chain3 as never);

			const result = await client.callTool({
				name: 'get-project-stats',
				arguments: {}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.testCaseCount).toBe(5);
			expect(parsed.testRunCount).toBe(3);
			expect(parsed.executionCounts.PASS).toBe(10);
			expect(parsed.executionCounts.FAIL).toBe(2);
			expect(parsed.passRate).toBe(83.33);
		});
	});

	// ── get-trends ───────────────────────────────────────

	describe('get-trends', () => {
		it('should return empty array when no completed runs', async () => {
			// First select returns empty runs
			const chain1 = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), then: (r: (v: unknown) => void) => Promise.resolve([]).then(r) };

			mockDb.select.mockReturnValueOnce(chain1 as never);

			const result = await client.callTool({
				name: 'get-trends',
				arguments: {}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed).toEqual([]);
		});

		it('should return trends for completed runs', async () => {
			const finishedAt = new Date('2025-01-15');
			// First select: runs
			const chain1 = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), then: (r: (v: unknown) => void) => Promise.resolve([{ id: 1, name: 'Run1', environment: 'DEV', finishedAt }]).then(r) };
			// Second select: exec counts
			const chain2 = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), groupBy: vi.fn().mockReturnThis(), then: (r: (v: unknown) => void) => Promise.resolve([{ testRunId: 1, status: 'PASS', count: 8 }, { testRunId: 1, status: 'FAIL', count: 2 }]).then(r) };

			mockDb.select
				.mockReturnValueOnce(chain1 as never)
				.mockReturnValueOnce(chain2 as never);

			const result = await client.callTool({
				name: 'get-trends',
				arguments: {}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed).toHaveLength(1);
			expect(parsed[0].runName).toBe('Run1');
			expect(parsed[0].passCount).toBe(8);
			expect(parsed[0].failCount).toBe(2);
			expect(parsed[0].totalCount).toBe(10);
			expect(parsed[0].passRate).toBe(80);
		});
	});

	// ── get-risk-matrix ──────────────────────────────────

	describe('get-risk-matrix', () => {
		it('should return matrix and totals', async () => {
			// First select: risk matrix rows
			const chain1 = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), groupBy: vi.fn().mockReturnThis(), then: (r: (v: unknown) => void) => Promise.resolve([{ riskImpact: 'HIGH', riskLikelihood: 'HIGH', riskLevel: 'CRITICAL', count: 3 }]).then(r) };
			// Second select: totals
			const chain2 = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), then: (r: (v: unknown) => void) => Promise.resolve([{ total: 10, assessed: 5 }]).then(r) };

			mockDb.select
				.mockReturnValueOnce(chain1 as never)
				.mockReturnValueOnce(chain2 as never);

			const result = await client.callTool({
				name: 'get-risk-matrix',
				arguments: {}
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.matrix).toHaveLength(1);
			expect(parsed.matrix[0].riskLevel).toBe('CRITICAL');
			expect(parsed.matrix[0].count).toBe(3);
			expect(parsed.total).toBe(10);
			expect(parsed.assessed).toBe(5);
			expect(parsed.unassessed).toBe(5);
		});
	});
});
