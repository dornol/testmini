import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';

const mockLog = vi.hoisted(() => ({
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn()
}));

// Mock Redis as unavailable (no REDIS_URL) to test in-memory fallback
vi.mock('ioredis', () => {
	function RedisMock() {
		return {};
	}
	return { default: RedisMock };
});
vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/server/logger', () => ({
	childLogger: () => mockLog
}));

const { checkRateLimit, rateLimitMultiplier } = await import('$lib/server/rate-limit');

describe('checkRateLimit (in-memory fallback)', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	it('should allow requests within the limit', async () => {
		const result = await checkRateLimit('test:ip1', 5, 60_000);

		expect(result.allowed).toBe(true);
		expect(result.remaining).toBe(4);
	});

	it('should track multiple requests', async () => {
		await checkRateLimit('test:ip2', 5, 60_000);
		await checkRateLimit('test:ip2', 5, 60_000);
		const result = await checkRateLimit('test:ip2', 5, 60_000);

		expect(result.allowed).toBe(true);
		expect(result.remaining).toBe(2);
	});

	it('should reject when limit is reached', async () => {
		for (let i = 0; i < 3; i++) {
			await checkRateLimit('test:ip3', 3, 60_000);
		}

		const result = await checkRateLimit('test:ip3', 3, 60_000);

		expect(result.allowed).toBe(false);
		expect(result.remaining).toBe(0);
		expect(result.retryAfter).toBeGreaterThan(0);
	});

	it('should reset after the window expires', async () => {
		for (let i = 0; i < 3; i++) {
			await checkRateLimit('test:ip4', 3, 60_000);
		}

		// Blocked
		expect((await checkRateLimit('test:ip4', 3, 60_000)).allowed).toBe(false);

		// Advance past the window
		vi.advanceTimersByTime(61_000);

		const result = await checkRateLimit('test:ip4', 3, 60_000);
		expect(result.allowed).toBe(true);
		expect(result.remaining).toBe(2);
	});

	it('should isolate different keys', async () => {
		for (let i = 0; i < 5; i++) {
			await checkRateLimit('test:ip5', 5, 60_000);
		}

		// ip5 is exhausted
		expect((await checkRateLimit('test:ip5', 5, 60_000)).allowed).toBe(false);

		// ip6 should be fine
		const result = await checkRateLimit('test:ip6', 5, 60_000);
		expect(result.allowed).toBe(true);
		expect(result.remaining).toBe(4);
	});

	it('should handle sliding window correctly', async () => {
		// Make 2 requests at t=0
		await checkRateLimit('test:ip7', 3, 60_000);
		await checkRateLimit('test:ip7', 3, 60_000);

		// Advance 30 seconds and make 1 more
		vi.advanceTimersByTime(30_000);
		await checkRateLimit('test:ip7', 3, 60_000);

		// Now at limit — should block
		expect((await checkRateLimit('test:ip7', 3, 60_000)).allowed).toBe(false);

		// Advance 31 seconds — first 2 requests expire
		vi.advanceTimersByTime(31_000);

		const result = await checkRateLimit('test:ip7', 3, 60_000);
		expect(result.allowed).toBe(true);
		expect(result.remaining).toBe(1); // 1 still in window + this new one = 2 used
	});

	it('should provide retryAfter in seconds', async () => {
		for (let i = 0; i < 3; i++) {
			await checkRateLimit('test:ip8', 3, 60_000);
		}

		const result = await checkRateLimit('test:ip8', 3, 60_000);

		expect(result.allowed).toBe(false);
		expect(result.retryAfter).toBeDefined();
		expect(result.retryAfter).toBeGreaterThanOrEqual(1);
		expect(result.retryAfter).toBeLessThanOrEqual(60);
	});

	afterEach(() => {
		vi.useRealTimers();
	});
});

describe('checkRateLimit (redis logging)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	it('redacts redis errors and logs only a hashed rate limit key', async () => {
		const sensitiveKey = 'ip:1.2.3.4:token=rate-limit-token-12345';
		const expectedHash = createHash('sha256').update(sensitiveKey).digest('hex').slice(0, 16);
		const pipeline = {
			zremrangebyscore: vi.fn(),
			zadd: vi.fn(),
			zcard: vi.fn(),
			expire: vi.fn(),
			exec: vi.fn().mockResolvedValue([
				[null, 1],
				[null, 1],
				[new Error('redis failed apiToken=rate-limit-token-12345'), 0],
				[null, 1]
			])
		};
		vi.doMock('$lib/server/redis', () => ({
			redis: {
				multi: () => pipeline
			}
		}));

		const { checkRateLimit: checkRateLimitWithRedis } = await import('$lib/server/rate-limit');

		const result = await checkRateLimitWithRedis(sensitiveKey, 5, 60_000);

		const [logMeta] = mockLog.warn.mock.calls[0];

		expect(result.allowed).toBe(true);
		expect(logMeta.keyHash).toBe(expectedHash);
		expect(logMeta).not.toHaveProperty('key');
		expect(logMeta.err.message).not.toContain('rate-limit-token-12345');
		expect(logMeta.err).not.toHaveProperty('stack');
	});
});

describe('rateLimitMultiplier', () => {
	it('defaults to 1 for missing, invalid or lowering values', () => {
		for (const raw of [undefined, '', 'abc', '0', '-3', '0.5', 'Infinity', 'NaN'])
			expect(rateLimitMultiplier(raw)).toBe(1);
	});

	it('accepts whole multipliers of 1 or more', () => {
		expect(rateLimitMultiplier('1')).toBe(1);
		expect(rateLimitMultiplier('10')).toBe(10);
		expect(rateLimitMultiplier('2.9')).toBe(2);
	});
});
