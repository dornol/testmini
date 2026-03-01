import { redis } from './redis';

const LOCK_TTL = 120; // 2 minutes
const LOCK_PREFIX = 'lock:tc:';

interface LockInfo {
	userId: string;
	userName: string;
	acquiredAt: string;
}

export async function acquireLock(
	tcId: number,
	userId: string,
	userName: string
): Promise<{ acquired: boolean; holder?: LockInfo }> {
	const key = LOCK_PREFIX + tcId;
	const value = JSON.stringify({ userId, userName, acquiredAt: new Date().toISOString() });

	// Check if same user already holds the lock
	const existing = await redis.get(key);
	if (existing) {
		const holder: LockInfo = JSON.parse(existing);
		if (holder.userId === userId) {
			// Same user — extend TTL
			await redis.expire(key, LOCK_TTL);
			return { acquired: true };
		}
		return { acquired: false, holder };
	}

	// Try to acquire with NX (only set if not exists)
	const result = await redis.set(key, value, 'EX', LOCK_TTL, 'NX');
	if (result === 'OK') {
		return { acquired: true };
	}

	// Someone else grabbed it between our check and set
	const current = await redis.get(key);
	if (current) {
		return { acquired: false, holder: JSON.parse(current) };
	}
	return { acquired: false };
}

export async function releaseLock(tcId: number, userId: string): Promise<boolean> {
	const key = LOCK_PREFIX + tcId;
	const existing = await redis.get(key);
	if (!existing) return true;

	const holder: LockInfo = JSON.parse(existing);
	if (holder.userId !== userId) {
		return false; // Not the owner
	}

	await redis.del(key);
	return true;
}

export async function refreshLock(tcId: number, userId: string): Promise<boolean> {
	const key = LOCK_PREFIX + tcId;
	const existing = await redis.get(key);
	if (!existing) return false;

	const holder: LockInfo = JSON.parse(existing);
	if (holder.userId !== userId) {
		return false;
	}

	await redis.expire(key, LOCK_TTL);
	return true;
}

export async function getLockInfo(tcId: number): Promise<LockInfo | null> {
	const key = LOCK_PREFIX + tcId;
	const existing = await redis.get(key);
	if (!existing) return null;
	return JSON.parse(existing);
}
