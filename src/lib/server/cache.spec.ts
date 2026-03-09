import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cacheGet, cacheSet, cacheDelete, cacheDeleteByPrefix, cacheClear, cacheStats } from './cache';

describe('cache', () => {
	beforeEach(() => {
		cacheClear();
		vi.useRealTimers();
	});

	it('returns undefined for missing key', () => {
		expect(cacheGet('nonexistent')).toBeUndefined();
	});

	it('returns stored value after set', () => {
		cacheSet('key1', { foo: 'bar' }, 60_000);
		expect(cacheGet('key1')).toEqual({ foo: 'bar' });
	});

	it('returns undefined after TTL expires', () => {
		vi.useFakeTimers();
		cacheSet('key1', 'value', 1000);
		expect(cacheGet('key1')).toBe('value');
		vi.advanceTimersByTime(1001);
		expect(cacheGet('key1')).toBeUndefined();
	});

	it('deletes a specific key', () => {
		cacheSet('a', 1, 60_000);
		cacheSet('b', 2, 60_000);
		cacheDelete('a');
		expect(cacheGet('a')).toBeUndefined();
		expect(cacheGet('b')).toBe(2);
	});

	it('deletes keys matching a prefix', () => {
		cacheSet('project:1:priorities', 'p1', 60_000);
		cacheSet('project:1:environments', 'e1', 60_000);
		cacheSet('project:2:priorities', 'p2', 60_000);
		cacheDeleteByPrefix('project:1:');
		expect(cacheGet('project:1:priorities')).toBeUndefined();
		expect(cacheGet('project:1:environments')).toBeUndefined();
		expect(cacheGet('project:2:priorities')).toBe('p2');
	});

	it('clears all entries', () => {
		cacheSet('a', 1, 60_000);
		cacheSet('b', 2, 60_000);
		cacheClear();
		expect(cacheGet('a')).toBeUndefined();
		expect(cacheGet('b')).toBeUndefined();
	});

	it('overwrites existing value', () => {
		cacheSet('key', 'old', 60_000);
		cacheSet('key', 'new', 60_000);
		expect(cacheGet('key')).toBe('new');
	});

	it('different keys do not interfere', () => {
		cacheSet('x', 10, 60_000);
		cacheSet('y', 20, 60_000);
		expect(cacheGet('x')).toBe(10);
		expect(cacheGet('y')).toBe(20);
	});

	describe('cacheStats', () => {
		beforeEach(() => {
			cacheStats(); // reset counters
		});

		it('tracks cache hits', () => {
			cacheSet('key', 'val', 60_000);
			cacheGet('key');
			cacheGet('key');

			const stats = cacheStats();
			expect(stats.hits).toBe(2);
			expect(stats.misses).toBe(0);
			expect(stats.hitRate).toBe(1);
		});

		it('tracks cache misses', () => {
			cacheGet('miss1');
			cacheGet('miss2');

			const stats = cacheStats();
			expect(stats.hits).toBe(0);
			expect(stats.misses).toBe(2);
			expect(stats.hitRate).toBe(0);
		});

		it('counts expired entries as misses', () => {
			vi.useFakeTimers();
			cacheSet('exp', 'val', 100);
			vi.advanceTimersByTime(200);
			cacheGet('exp'); // expired → miss

			const stats = cacheStats();
			expect(stats.misses).toBe(1);
			expect(stats.hits).toBe(0);
		});

		it('calculates hit rate correctly', () => {
			cacheSet('k', 'v', 60_000);
			cacheGet('k'); // hit
			cacheGet('k'); // hit
			cacheGet('k'); // hit
			cacheGet('miss'); // miss

			const stats = cacheStats();
			expect(stats.hitRate).toBe(0.75);
		});

		it('resets counters after reading', () => {
			cacheSet('k', 'v', 60_000);
			cacheGet('k');
			cacheStats(); // read + reset

			const stats = cacheStats();
			expect(stats.hits).toBe(0);
			expect(stats.misses).toBe(0);
		});

		it('returns 0 hitRate when no operations', () => {
			expect(cacheStats().hitRate).toBe(0);
		});

		it('reports correct store size', () => {
			cacheSet('a', 1, 60_000);
			cacheSet('b', 2, 60_000);
			cacheSet('c', 3, 60_000);

			expect(cacheStats().size).toBe(3);
		});

		it('does not count cacheSet or cacheDelete as hits/misses', () => {
			cacheSet('a', 1, 60_000);
			cacheDelete('a');
			cacheSet('b', 2, 60_000);

			const stats = cacheStats();
			expect(stats.hits).toBe(0);
			expect(stats.misses).toBe(0);
		});

		it('tracks interleaved hits and misses correctly', () => {
			cacheSet('k1', 'v1', 60_000);
			cacheSet('k2', 'v2', 60_000);

			cacheGet('k1'); // hit
			cacheGet('miss1'); // miss
			cacheGet('k2'); // hit
			cacheGet('miss2'); // miss
			cacheGet('k1'); // hit

			const stats = cacheStats();
			expect(stats.hits).toBe(3);
			expect(stats.misses).toBe(2);
			expect(stats.hitRate).toBe(0.6);
		});

		it('reports 0 size after cacheClear', () => {
			cacheSet('a', 1, 60_000);
			cacheSet('b', 2, 60_000);
			cacheClear();

			expect(cacheStats().size).toBe(0);
		});

		it('size excludes deleted prefix entries', () => {
			cacheSet('project:1:a', 1, 60_000);
			cacheSet('project:1:b', 2, 60_000);
			cacheSet('project:2:a', 3, 60_000);
			cacheDeleteByPrefix('project:1:');

			expect(cacheStats().size).toBe(1);
		});
	});
});
