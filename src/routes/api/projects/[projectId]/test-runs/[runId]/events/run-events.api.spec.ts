import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';

const mockDb = createMockDb();
const mockSubscriber = {
	subscribe: vi.fn().mockResolvedValue(undefined),
	on: vi.fn(),
	unsubscribe: vi.fn().mockResolvedValue(undefined),
	disconnect: vi.fn()
};
const mockCreateSubscriber = vi.fn(() => mockSubscriber);

vi.mock('$lib/server/db', () => ({ db: mockDb, col: mockDb.col, sql: mockDb.sql }));
vi.mock('$lib/server/db/schema', () => ({
	testRun: { id: 'id', projectId: 'project_id' }
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args)
}));
vi.mock('$lib/server/redis', () => ({
	createSubscriber: mockCreateSubscriber
}));
vi.mock('$lib/server/api-handler', () => ({
	withProjectRole:
		(_roles: string[], handler: (event: Record<string, unknown>) => Promise<Response>) =>
		(event: Record<string, unknown>) =>
			handler({ ...event, projectId: 1, user: { id: 'user-1', role: 'user' } })
}));

const { GET } = await import('./+server');

function makeEvent(params = { projectId: '1', runId: '5' }) {
	return {
		params,
		request: new Request('http://localhost/api/projects/1/test-runs/5/events')
	} as never;
}

describe('/api/projects/[projectId]/test-runs/[runId]/events', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.query.testRun.findFirst.mockResolvedValue({ id: 5 });
	});

	it('opens an event stream for a run scoped to the project', async () => {
		const response = await GET(makeEvent());

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('text/event-stream');
		expect(mockDb.query.testRun.findFirst).toHaveBeenCalledWith({
			where: expect.arrayContaining([
				['id', 5],
				['project_id', 1]
			]),
			columns: { id: true }
		});
		expect(mockCreateSubscriber).toHaveBeenCalledTimes(1);
	});

	it('rejects a run that does not belong to the project before subscribing', async () => {
		mockDb.query.testRun.findFirst.mockResolvedValue(null);

		await expect(GET(makeEvent())).rejects.toMatchObject({ status: 404 });

		expect(mockCreateSubscriber).not.toHaveBeenCalled();
	});
});
