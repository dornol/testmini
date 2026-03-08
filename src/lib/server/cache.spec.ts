import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cacheGet, cacheSet, cacheDelete, cacheDeleteByPrefix, cacheClear } from './cache';

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
});
