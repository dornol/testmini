import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockDb, mockSelectResult, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { sampleProject } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	project: { id: 'id', createdBy: 'created_by' },
	exploratorySession: { id: 'id', projectId: 'project_id', title: 'title', charter: 'charter', environment: 'environment', status: 'status', summary: 'summary', tags: 'tags', createdBy: 'created_by', startedAt: 'started_at', createdAt: 'created_at', updatedAt: 'updated_at' },
	sessionNote: { id: 'id', sessionId: 'session_id', noteType: 'note_type', content: 'content', timestamp: 'timestamp', createdAt: 'created_at' }
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

const { registerExploratoryTools } = await import('./exploratory');

const PROJECT_ID = 1;

type ContentArray = Array<{ type: string; text: string }>;
function parseResult(result: { content?: unknown }) {
	return JSON.parse((result.content as ContentArray)[0].text);
}

async function createClient() {
	const server = new McpServer({ name: 'test', version: '1.0.0' });
	registerExploratoryTools(server, PROJECT_ID);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: 'test-client', version: '1.0.0' });
	await client.connect(clientTransport);
	return { client, close: () => clientTransport.close() };
}

const sampleSession = {
	id: 1,
	projectId: 1,
	title: 'Explore login flow',
	charter: 'Test edge cases in login',
	environment: 'Chrome',
	status: 'ACTIVE',
	summary: null,
	tags: ['login', 'edge-cases'],
	createdBy: 'user-1',
	startedAt: new Date('2025-01-01'),
	createdAt: new Date('2025-01-01'),
	updatedAt: new Date('2025-01-01')
};

const sampleNote = {
	id: 1,
	sessionId: 1,
	noteType: 'NOTE',
	content: 'Found a weird behavior',
	timestamp: 120,
	createdAt: new Date('2025-01-01')
};

describe('MCP exploratory tools', () => {
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

	// ── create-exploratory-session ───────────────────────

	describe('create-exploratory-session', () => {
		it('should create a session', async () => {
			mockDb.query.project.findFirst.mockResolvedValue(sampleProject);
			mockInsertReturning(mockDb, [sampleSession]);

			const result = await client.callTool({
				name: 'create-exploratory-session',
				arguments: { title: 'Explore login flow', charter: 'Test edge cases in login', environment: 'Chrome', tags: ['login', 'edge-cases'] }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.title).toBe('Explore login flow');
			expect(parsed.status).toBe('ACTIVE');
		});
	});

	// ── get-exploratory-session ──────────────────────────

	describe('get-exploratory-session', () => {
		it('should return session with notes', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue(sampleSession);
			mockSelectResult(mockDb, [sampleNote]);

			const result = await client.callTool({
				name: 'get-exploratory-session',
				arguments: { sessionId: 1 }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.title).toBe('Explore login flow');
			expect(parsed.notes).toHaveLength(1);
			expect(parsed.notes[0].content).toBe('Found a weird behavior');
		});

		it('should return error when session not found', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue(null);

			const result = await client.callTool({
				name: 'get-exploratory-session',
				arguments: { sessionId: 999 }
			});

			expect(result.isError).toBe(true);
			expect((result.content as ContentArray)[0].text).toBe('Session not found');
		});
	});

	// ── update-exploratory-session ───────────────────────

	describe('update-exploratory-session', () => {
		it('should update status to COMPLETED', async () => {
			mockDb.query.exploratorySession.findFirst
				.mockResolvedValueOnce(sampleSession)
				.mockResolvedValueOnce({ ...sampleSession, status: 'COMPLETED', summary: 'All done' });

			const result = await client.callTool({
				name: 'update-exploratory-session',
				arguments: { sessionId: 1, status: 'COMPLETED', summary: 'All done' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.status).toBe('COMPLETED');
			expect(parsed.summary).toBe('All done');
		});
	});

	// ── add-session-note ────────────────────────────────

	describe('add-session-note', () => {
		it('should add a note to session', async () => {
			mockDb.query.exploratorySession.findFirst.mockResolvedValue(sampleSession);
			mockInsertReturning(mockDb, [sampleNote]);

			const result = await client.callTool({
				name: 'add-session-note',
				arguments: { sessionId: 1, content: 'Found a weird behavior', noteType: 'NOTE' }
			});

			expect(result.isError).toBeFalsy();
			const parsed = parseResult(result);
			expect(parsed.content).toBe('Found a weird behavior');
			expect(parsed.noteType).toBe('NOTE');
		});
	});
});
