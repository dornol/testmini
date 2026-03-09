import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/logger', () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	}
}));

vi.mock('$lib/server/db', () => ({
	db: {
		select: vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue(Promise.resolve([{ value: 0 }]))
		}),
		insert: vi.fn().mockReturnValue({
			values: vi.fn().mockReturnValue(Promise.resolve())
		})
	}
}));

vi.mock('$lib/server/db/auth.schema', () => ({
	user: { id: 'id' },
	account: { id: 'id' }
}));

vi.mock('drizzle-orm', () => ({
	count: vi.fn()
}));

vi.mock('better-auth/crypto', () => ({
	hashPassword: vi.fn().mockResolvedValue('hashed_pw'),
	generateRandomString: vi.fn().mockReturnValue('random-id-12345')
}));

vi.mock('$env/dynamic/private', () => ({
	env: {}
}));

import { seedAdminUser } from './seed';
import { logger } from '$lib/server/logger';
import { db } from '$lib/server/db';

const mockLogger = logger as unknown as {
	info: ReturnType<typeof vi.fn>;
	warn: ReturnType<typeof vi.fn>;
	error: ReturnType<typeof vi.fn>;
};

describe('seedAdminUser', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Default: no users exist
		vi.mocked(db.select).mockReturnValue({
			from: vi.fn().mockReturnValue(Promise.resolve([{ value: 0 }]))
		} as never);
		vi.mocked(db.insert).mockReturnValue({
			values: vi.fn().mockReturnValue(Promise.resolve())
		} as never);
	});

	it('should skip seeding when users already exist', async () => {
		vi.mocked(db.select).mockReturnValue({
			from: vi.fn().mockReturnValue(Promise.resolve([{ value: 5 }]))
		} as never);

		await seedAdminUser();

		expect(db.insert).not.toHaveBeenCalled();
	});

	it('should create admin account when no users exist', async () => {
		await seedAdminUser();

		expect(db.insert).toHaveBeenCalledTimes(2); // user + account
	});

	it('should log admin account creation message', async () => {
		await seedAdminUser();

		const allInfoCalls = mockLogger.info.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
		expect(allInfoCalls).toContain('Admin account created');
	});

	it('should not log the password in plaintext', async () => {
		await seedAdminUser();

		const allLogCalls = [
			...mockLogger.info.mock.calls.map((c: unknown[]) => c.join(' ')),
			...mockLogger.warn.mock.calls.map((c: unknown[]) => c.join(' '))
		].join('\n');

		// Default password is 'admin1234' — it must NOT appear in logs
		expect(allLogCalls).not.toContain('admin1234');
	});

	it('should warn when using default password', async () => {
		await seedAdminUser();

		expect(mockLogger.warn).toHaveBeenCalledWith(
			expect.stringContaining('default password')
		);
	});

	it('should log the email address', async () => {
		await seedAdminUser();

		const allInfoCalls = mockLogger.info.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
		expect(allInfoCalls).toContain('admin@admin.local');
	});
});
