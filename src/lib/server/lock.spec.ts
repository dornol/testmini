import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock ioredis before importing any module that uses it
const mockRedis = {
	get: vi.fn(),
	set: vi.fn(),
	del: vi.fn(),
	expire: vi.fn(),
	publish: vi.fn(),
	on: vi.fn(),
	connect: vi.fn().mockResolvedValue(undefined)
};

vi.mock('ioredis', () => {
	// Must be a real constructor function (not an arrow function) so that
	// `new Redis(...)` works inside redis.ts.
	function RedisMock() {
		return mockRedis;
	}
	return { default: RedisMock };
});

// Mock env so redis.ts does not blow up during import
vi.mock('$env/dynamic/private', () => ({ env: { REDIS_URL: 'redis://localhost:6379' } }));
vi.mock('$lib/server/logger', () => ({
	childLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

const { acquireLock, releaseLock, refreshLock, getLockInfo } = await import('$lib/server/lock');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TC_ID = 42;

function makeLockValue(userId: string, userName: string, acquiredAt = '2026-01-01T00:00:00.000Z') {
	return JSON.stringify({ userId, userName, acquiredAt });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('acquireLock', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should acquire a lock successfully when none exists', async () => {
		mockRedis.get.mockResolvedValue(null);
		mockRedis.set.mockResolvedValue('OK');

		const result = await acquireLock(TC_ID, 'user-1', 'Alice');

		expect(result.acquired).toBe(true);
		expect(result.holder).toBeUndefined();
		expect(mockRedis.set).toHaveBeenCalledWith(
			`lock:tc:${TC_ID}`,
			expect.stringContaining('"userId":"user-1"'),
			'EX',
			120,
			'NX'
		);
	});

	it('should fail to acquire when already locked by another user', async () => {
		const holderValue = makeLockValue('user-2', 'Bob');
		mockRedis.get.mockResolvedValue(holderValue);

		const result = await acquireLock(TC_ID, 'user-1', 'Alice');

		expect(result.acquired).toBe(false);
		expect(result.holder).toEqual(JSON.parse(holderValue));
		// Should not attempt to set a new lock
		expect(mockRedis.set).not.toHaveBeenCalled();
	});

	it('should allow the same user to re-acquire their own lock (extends TTL)', async () => {
		const holderValue = makeLockValue('user-1', 'Alice');
		mockRedis.get.mockResolvedValue(holderValue);
		mockRedis.expire.mockResolvedValue(1);

		const result = await acquireLock(TC_ID, 'user-1', 'Alice');

		expect(result.acquired).toBe(true);
		expect(mockRedis.expire).toHaveBeenCalledWith(`lock:tc:${TC_ID}`, 120);
		// Should NOT call set — just expire
		expect(mockRedis.set).not.toHaveBeenCalled();
	});

	it('should return acquired:false with holder when a race causes NX to fail', async () => {
		// First get returns null (no lock), but the NX set also fails (race)
		const holderValue = makeLockValue('user-2', 'Bob');
		mockRedis.get
			.mockResolvedValueOnce(null) // initial check
			.mockResolvedValueOnce(holderValue); // post-race check
		mockRedis.set.mockResolvedValue(null); // NX returned null → someone else won the race

		const result = await acquireLock(TC_ID, 'user-1', 'Alice');

		expect(result.acquired).toBe(false);
		expect(result.holder).toEqual(JSON.parse(holderValue));
	});

	it('should return acquired:false without holder when lock disappears after race', async () => {
		mockRedis.get
			.mockResolvedValueOnce(null) // initial check: no lock
			.mockResolvedValueOnce(null); // post-race check: still no lock (lock already expired)
		mockRedis.set.mockResolvedValue(null); // NX failed

		const result = await acquireLock(TC_ID, 'user-1', 'Alice');

		expect(result.acquired).toBe(false);
		expect(result.holder).toBeUndefined();
	});

	it('should use the key prefix lock:tc: with the test case id', async () => {
		mockRedis.get.mockResolvedValue(null);
		mockRedis.set.mockResolvedValue('OK');

		await acquireLock(99, 'user-1', 'Alice');

		expect(mockRedis.get).toHaveBeenCalledWith('lock:tc:99');
		expect(mockRedis.set).toHaveBeenCalledWith(
			'lock:tc:99',
			expect.any(String),
			'EX',
			120,
			'NX'
		);
	});
});

describe('releaseLock', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should release the lock when the caller is the owner', async () => {
		mockRedis.get.mockResolvedValue(makeLockValue('user-1', 'Alice'));
		mockRedis.del.mockResolvedValue(1);

		const released = await releaseLock(TC_ID, 'user-1');

		expect(released).toBe(true);
		expect(mockRedis.del).toHaveBeenCalledWith(`lock:tc:${TC_ID}`);
	});

	it('should return true when the lock does not exist (already released)', async () => {
		mockRedis.get.mockResolvedValue(null);

		const released = await releaseLock(TC_ID, 'user-1');

		expect(released).toBe(true);
		expect(mockRedis.del).not.toHaveBeenCalled();
	});

	it('should return false and not delete when caller is not the owner', async () => {
		mockRedis.get.mockResolvedValue(makeLockValue('user-2', 'Bob'));

		const released = await releaseLock(TC_ID, 'user-1');

		expect(released).toBe(false);
		expect(mockRedis.del).not.toHaveBeenCalled();
	});
});

describe('refreshLock', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should refresh TTL when the caller owns the lock', async () => {
		mockRedis.get.mockResolvedValue(makeLockValue('user-1', 'Alice'));
		mockRedis.expire.mockResolvedValue(1);

		const refreshed = await refreshLock(TC_ID, 'user-1');

		expect(refreshed).toBe(true);
		expect(mockRedis.expire).toHaveBeenCalledWith(`lock:tc:${TC_ID}`, 120);
	});

	it('should return false when the lock does not exist', async () => {
		mockRedis.get.mockResolvedValue(null);

		const refreshed = await refreshLock(TC_ID, 'user-1');

		expect(refreshed).toBe(false);
		expect(mockRedis.expire).not.toHaveBeenCalled();
	});

	it('should return false when a different user owns the lock', async () => {
		mockRedis.get.mockResolvedValue(makeLockValue('user-2', 'Bob'));

		const refreshed = await refreshLock(TC_ID, 'user-1');

		expect(refreshed).toBe(false);
		expect(mockRedis.expire).not.toHaveBeenCalled();
	});
});

describe('getLockInfo', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should return lock info when lock exists', async () => {
		const lockData = { userId: 'user-1', userName: 'Alice', acquiredAt: '2026-01-01T00:00:00.000Z' };
		mockRedis.get.mockResolvedValue(JSON.stringify(lockData));

		const info = await getLockInfo(TC_ID);

		expect(info).toEqual(lockData);
	});

	it('should return null when no lock exists', async () => {
		mockRedis.get.mockResolvedValue(null);

		const info = await getLockInfo(TC_ID);

		expect(info).toBeNull();
	});
});
