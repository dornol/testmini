import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Redis as unavailable (no REDIS_URL)
vi.mock('ioredis', () => {
	function RedisMock() {
		return {};
	}
	return { default: RedisMock };
});
vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/server/logger', () => ({
	childLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

const { acquireLock, releaseLock, refreshLock, getLockInfo } = await import('$lib/server/lock');

const TC_ID = 100;

describe('lock (in-memory fallback)', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(async () => {
		// Clean up: release any held locks
		await releaseLock(TC_ID, 'user-1');
		await releaseLock(TC_ID, 'user-2');
		vi.useRealTimers();
	});

	describe('acquireLock', () => {
		it('should acquire a lock when none exists', async () => {
			const result = await acquireLock(TC_ID, 'user-1', 'Alice');

			expect(result.acquired).toBe(true);
			expect(result.holder).toBeUndefined();
		});

		it('should allow the same user to re-acquire (refresh TTL)', async () => {
			await acquireLock(TC_ID, 'user-1', 'Alice');

			const result = await acquireLock(TC_ID, 'user-1', 'Alice');

			expect(result.acquired).toBe(true);
		});

		it('should reject when another user holds the lock', async () => {
			await acquireLock(TC_ID, 'user-1', 'Alice');

			const result = await acquireLock(TC_ID, 'user-2', 'Bob');

			expect(result.acquired).toBe(false);
			expect(result.holder).toBeDefined();
			expect(result.holder!.userId).toBe('user-1');
			expect(result.holder!.userName).toBe('Alice');
		});

		it('should auto-expire after TTL', async () => {
			await acquireLock(TC_ID, 'user-1', 'Alice');

			// Advance past 2-minute TTL
			vi.advanceTimersByTime(121_000);

			const result = await acquireLock(TC_ID, 'user-2', 'Bob');

			expect(result.acquired).toBe(true);
		});

		it('should set acquiredAt timestamp', async () => {
			await acquireLock(TC_ID, 'user-1', 'Alice');

			const info = await getLockInfo(TC_ID);

			expect(info).not.toBeNull();
			expect(info!.acquiredAt).toBeTruthy();
			expect(new Date(info!.acquiredAt).getTime()).not.toBeNaN();
		});
	});

	describe('releaseLock', () => {
		it('should release when caller is the owner', async () => {
			await acquireLock(TC_ID, 'user-1', 'Alice');

			const released = await releaseLock(TC_ID, 'user-1');

			expect(released).toBe(true);
			expect(await getLockInfo(TC_ID)).toBeNull();
		});

		it('should return true when no lock exists', async () => {
			const released = await releaseLock(TC_ID, 'user-1');

			expect(released).toBe(true);
		});

		it('should reject when caller is not the owner', async () => {
			await acquireLock(TC_ID, 'user-1', 'Alice');

			const released = await releaseLock(TC_ID, 'user-2');

			expect(released).toBe(false);
			// Lock should still be held
			expect(await getLockInfo(TC_ID)).not.toBeNull();
		});
	});

	describe('refreshLock', () => {
		it('should refresh TTL for the owner', async () => {
			await acquireLock(TC_ID, 'user-1', 'Alice');

			// Advance 100 seconds (within 120s TTL)
			vi.advanceTimersByTime(100_000);

			const refreshed = await refreshLock(TC_ID, 'user-1');
			expect(refreshed).toBe(true);

			// Advance another 100 seconds — should still be locked (TTL was refreshed)
			vi.advanceTimersByTime(100_000);

			const info = await getLockInfo(TC_ID);
			expect(info).not.toBeNull();
			expect(info!.userId).toBe('user-1');
		});

		it('should return false when no lock exists', async () => {
			const refreshed = await refreshLock(TC_ID, 'user-1');

			expect(refreshed).toBe(false);
		});

		it('should return false when caller is not the owner', async () => {
			await acquireLock(TC_ID, 'user-1', 'Alice');

			const refreshed = await refreshLock(TC_ID, 'user-2');

			expect(refreshed).toBe(false);
		});
	});

	describe('getLockInfo', () => {
		it('should return lock info when locked', async () => {
			await acquireLock(TC_ID, 'user-1', 'Alice');

			const info = await getLockInfo(TC_ID);

			expect(info).toEqual({
				userId: 'user-1',
				userName: 'Alice',
				acquiredAt: expect.any(String)
			});
		});

		it('should return null when not locked', async () => {
			const info = await getLockInfo(TC_ID);

			expect(info).toBeNull();
		});

		it('should return null after TTL expiry', async () => {
			await acquireLock(TC_ID, 'user-1', 'Alice');

			vi.advanceTimersByTime(121_000);

			const info = await getLockInfo(TC_ID);
			expect(info).toBeNull();
		});
	});
});
