import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	notification: { id: 'id' }
}));
vi.mock('$lib/server/logger', () => ({
	childLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

const { createNotification } = await import('./notifications');

describe('createNotification', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should insert into the DB with all provided fields', async () => {
		const insertChain = {
			values: vi.fn().mockReturnThis(),
			then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
		};
		mockDb.insert.mockReturnValue(insertChain as never);

		await createNotification({
			userId: 'user-1',
			type: 'TEST_RUN_COMPLETE',
			title: 'Test Run Finished',
			message: 'Sprint 1 run has completed',
			link: '/projects/1/runs/50',
			projectId: 1
		});

		expect(mockDb.insert).toHaveBeenCalledTimes(1);
		expect(insertChain.values).toHaveBeenCalledWith({
			userId: 'user-1',
			type: 'TEST_RUN_COMPLETE',
			title: 'Test Run Finished',
			message: 'Sprint 1 run has completed',
			link: '/projects/1/runs/50',
			projectId: 1
		});
	});

	it('should pass all fields correctly including nulls for missing optional fields', async () => {
		const insertChain = {
			values: vi.fn().mockReturnThis(),
			then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
		};
		mockDb.insert.mockReturnValue(insertChain as never);

		await createNotification({
			userId: 'user-2',
			type: 'MENTION',
			title: 'You were mentioned',
			message: 'Someone mentioned you in a comment'
		});

		expect(insertChain.values).toHaveBeenCalledWith({
			userId: 'user-2',
			type: 'MENTION',
			title: 'You were mentioned',
			message: 'Someone mentioned you in a comment',
			link: null,
			projectId: null
		});
	});

	it('should not throw on DB error (fire-and-forget)', async () => {
		mockDb.insert.mockImplementation(() => {
			throw new Error('DB connection failed');
		});

		await expect(
			createNotification({
				userId: 'user-1',
				type: 'TEST_RUN_COMPLETE',
				title: 'Run Done',
				message: 'Your run finished'
			})
		).resolves.toBeUndefined();
	});

	it('should not throw when insert returns a rejected promise', async () => {
		const insertChain = {
			values: vi.fn().mockReturnThis(),
			then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
				Promise.reject(new Error('DB write error')).then(resolve, reject)
		};
		mockDb.insert.mockReturnValue(insertChain as never);

		await expect(
			createNotification({
				userId: 'user-1',
				type: 'SYSTEM',
				title: 'System alert',
				message: 'Something happened'
			})
		).resolves.toBeUndefined();
	});

	it('should still call insert even without optional link and projectId', async () => {
		const insertChain = {
			values: vi.fn().mockReturnThis(),
			then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
		};
		mockDb.insert.mockReturnValue(insertChain as never);

		await createNotification({
			userId: 'user-3',
			type: 'INFO',
			title: 'FYI',
			message: 'Just so you know'
		});

		expect(mockDb.insert).toHaveBeenCalledTimes(1);
	});
});
