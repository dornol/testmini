import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';

const mockDb = createMockDb();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	auditLog: { id: 'id' }
}));

const { logAudit } = await import('./audit');

describe('logAudit', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should insert into the DB with all provided fields', async () => {
		const insertChain = {
			values: vi.fn().mockReturnThis(),
			then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
		};
		mockDb.insert.mockReturnValue(insertChain as never);

		await logAudit({
			userId: 'user-1',
			action: 'TEST_CASE_CREATED',
			entityType: 'test_case',
			entityId: '42',
			projectId: 1,
			metadata: { key: 'value' },
			ipAddress: '127.0.0.1'
		});

		expect(mockDb.insert).toHaveBeenCalledTimes(1);
		expect(insertChain.values).toHaveBeenCalledWith({
			userId: 'user-1',
			action: 'TEST_CASE_CREATED',
			entityType: 'test_case',
			entityId: '42',
			projectId: 1,
			metadata: { key: 'value' },
			ipAddress: '127.0.0.1'
		});
	});

	it('should pass all fields correctly including nulls for missing optional fields', async () => {
		const insertChain = {
			values: vi.fn().mockReturnThis(),
			then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
		};
		mockDb.insert.mockReturnValue(insertChain as never);

		await logAudit({ action: 'USER_LOGIN' });

		expect(insertChain.values).toHaveBeenCalledWith({
			userId: null,
			action: 'USER_LOGIN',
			entityType: null,
			entityId: null,
			projectId: null,
			metadata: null,
			ipAddress: null
		});
	});

	it('should not throw on DB error (fire-and-forget)', async () => {
		mockDb.insert.mockImplementation(() => {
			throw new Error('DB connection failed');
		});

		// Should resolve without throwing even though DB throws
		await expect(logAudit({ action: 'SOME_ACTION' })).resolves.toBeUndefined();
	});

	it('should not throw when insert returns a rejected promise', async () => {
		const insertChain = {
			values: vi.fn().mockReturnThis(),
			then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
				Promise.reject(new Error('DB write error')).then(resolve, reject)
		};
		mockDb.insert.mockReturnValue(insertChain as never);

		await expect(logAudit({ action: 'ANOTHER_ACTION' })).resolves.toBeUndefined();
	});

	it('should still call insert even when only required action field is provided', async () => {
		const insertChain = {
			values: vi.fn().mockReturnThis(),
			then: (r: (v: unknown) => void) => Promise.resolve(undefined).then(r)
		};
		mockDb.insert.mockReturnValue(insertChain as never);

		await logAudit({ action: 'MINIMAL_ACTION' });

		expect(mockDb.insert).toHaveBeenCalledTimes(1);
	});
});
