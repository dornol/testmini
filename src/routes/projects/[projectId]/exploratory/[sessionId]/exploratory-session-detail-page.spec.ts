import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	exploratorySession: { id: 'id', projectId: 'project_id', createdBy: 'created_by' },
	sessionNote: { id: 'id', sessionId: 'session_id', timestamp: 'timestamp' },
	user: { id: 'id', name: 'name', email: 'email' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	asc: vi.fn((a: unknown) => a)
}));
vi.mock('$lib/server/auth-utils', () => ({
	requireAuth: vi.fn(),
	requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' })
}));

const { load } = await import('./+page.server');

const PARAMS = { projectId: '1', sessionId: '5' };

const sampleSession = {
	id: 5, projectId: 1, title: 'Explore login',
	charter: 'Test login flows', status: 'ACTIVE',
	createdBy: 'user-1', startedAt: new Date()
};

function createLoadEvent(params = PARAMS) {
	const event = createMockEvent({ params });
	(event as Record<string, unknown>).parent = vi.fn().mockResolvedValue({});
	return event;
}

describe('exploratory/[sessionId] page server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(mockDb.query as Record<string, any>).exploratorySession = {
			findFirst: vi.fn().mockResolvedValue(sampleSession)
		};
		(mockDb.query as Record<string, any>).user = {
			findFirst: vi.fn().mockResolvedValue({ id: 'user-1', name: 'Tester', email: 'test@test.com' })
		};
	});

	it('should return 400 for invalid session ID', async () => {
		await expect(
			load(createLoadEvent({ projectId: '1', sessionId: 'abc' }) as never)
		).rejects.toThrow();
	});

	it('should return 404 when session not found', async () => {
		(mockDb.query as Record<string, any>).exploratorySession.findFirst.mockResolvedValue(null);
		await expect(load(createLoadEvent() as never)).rejects.toThrow();
	});

	it('should return session with notes and creator', async () => {
		const chain: Record<string, unknown> = {};
		for (const m of ['from', 'where', 'orderBy']) {
			chain[m] = vi.fn().mockReturnValue(chain);
		}
		chain.then = (resolve: (v: unknown) => void) =>
			Promise.resolve([
				{ id: 1, type: 'BUG', content: 'Found crash', timestamp: new Date() }
			]).then(resolve);
		mockDb.select.mockReturnValue(chain as never);

		const result = await load(createLoadEvent() as never) as Record<string, any>;

		expect(result.session.id).toBe(5);
		expect(result.session.title).toBe('Explore login');
		expect(result.notes).toHaveLength(1);
		expect(result.notes[0].type).toBe('BUG');
		expect(result.creator.name).toBe('Tester');
	});

	it('should return empty notes when none exist', async () => {
		const chain: Record<string, unknown> = {};
		for (const m of ['from', 'where', 'orderBy']) {
			chain[m] = vi.fn().mockReturnValue(chain);
		}
		chain.then = (resolve: (v: unknown) => void) => Promise.resolve([]).then(resolve);
		mockDb.select.mockReturnValue(chain as never);

		const result = await load(createLoadEvent() as never) as Record<string, any>;

		expect(result.notes).toEqual([]);
	});

	it('should return 500 when DB query fails', async () => {
		(mockDb.query as Record<string, any>).exploratorySession.findFirst.mockRejectedValue(
			new Error('DB error')
		);
		await expect(load(createLoadEvent() as never)).rejects.toThrow();
	});
});
