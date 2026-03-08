/**
 * Simple in-memory TTL cache for frequently-queried, rarely-changing data.
 * Falls back to a no-op when values are missing; never throws.
 */
const store = new Map<string, { value: unknown; expiresAt: number }>();

export function cacheGet<T>(key: string): T | undefined {
	const entry = store.get(key);
	if (!entry) return undefined;
	if (Date.now() > entry.expiresAt) {
		store.delete(key);
		return undefined;
	}
	return entry.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
	store.set(key, { value, expiresAt: Date.now() + ttlMs });
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
