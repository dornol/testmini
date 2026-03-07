import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Redis as unavailable (no REDIS_URL) to test in-memory fallback
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

const { checkRateLimit } = await import('$lib/server/rate-limit');

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
