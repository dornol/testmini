/**
 * Simple in-memory TTL cache for frequently-queried, rarely-changing data.
 * Falls back to a no-op when values are missing; never throws.
 */
const store = new Map<string, { value: unknown; expiresAt: number }>();

/** Cache hit/miss counters for monitoring */
let hits = 0;
let misses = 0;

export function cacheGet<T>(key: string): T | undefined {
	const entry = store.get(key);
	if (!entry) {
		misses++;
		return undefined;
	}
	if (Date.now() > entry.expiresAt) {
		store.delete(key);
		misses++;
		return undefined;
	}
	hits++;
	return entry.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
	store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/** Returns cache hit/miss stats and resets counters */
export function cacheStats(): { hits: number; misses: number; size: number; hitRate: number } {
	const total = hits + misses;
	const stats = { hits, misses, size: store.size, hitRate: total > 0 ? hits / total : 0 };
	hits = 0;
	misses = 0;
	return stats;
}

export function cacheDelete(key: string): void {
	store.delete(key);
}

/** Delete all entries matching a prefix */
export function cacheDeleteByPrefix(prefix: string): void {
	for (const key of store.keys()) {
		if (key.startsWith(prefix)) store.delete(key);
	}
}

export function cacheClear(): void {
	store.clear();
}
