import { redis } from './redis';
import { childLogger } from './logger';

const log = childLogger('rate-limit');

export interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	retryAfter?: number;
}

/**
 * Sliding window rate limiter using Redis sorted sets.
 *
 * Each request is stored as a member of a sorted set keyed by `key`,
 * with its score set to the current timestamp in milliseconds.
 * Old entries outside the window are removed on every check,
 * so the count always reflects only requests within the sliding window.
 *
 * Uses MULTI/EXEC to perform the operations atomically.
 */
export async function checkRateLimit(
	key: string,
	limit: number,
	windowMs: number
): Promise<RateLimitResult> {
	const now = Date.now();
	const windowStart = now - windowMs;
	// Unique member for this request: timestamp + random suffix to avoid collisions
	const member = `${now}:${Math.random().toString(36).slice(2, 9)}`;
	const redisKey = `rl:${key}`;
	const expireSeconds = Math.ceil(windowMs / 1000) + 1;

	try {
		const pipeline = redis.multi();

		// Remove entries older than the window
		pipeline.zremrangebyscore(redisKey, '-inf', windowStart);
		// Add the current request
		pipeline.zadd(redisKey, now, member);
		// Count requests in the current window
		pipeline.zcard(redisKey);
		// Reset TTL on every access so the key doesn't linger after traffic stops
		pipeline.expire(redisKey, expireSeconds);

		const results = await pipeline.exec();

		if (!results) {
			// EXEC returned null — transaction was aborted (WATCH violation, etc.)
			return { allowed: true, remaining: limit };
		}

		// results[2] is the ZCARD result: [error, count]
		const [cardErr, count] = results[2] as [Error | null, number];

		if (cardErr) {
			log.warn({ err: { message: cardErr.message }, key }, 'Redis ZCARD error');
			return { allowed: true, remaining: limit };
		}

		const currentCount = count as number;

		if (currentCount > limit) {
			// Undo the member we just added — the request is being rejected
			await redis.zrem(redisKey, member).catch(() => {});

			// Estimate when the oldest entry in the window will expire
			const oldestScore = await redis
				.zrange(redisKey, 0, 0, 'WITHSCORES')
				.catch(() => null);

			let retryAfter = Math.ceil(windowMs / 1000);
			if (oldestScore && oldestScore.length === 2) {
				const oldest = parseInt(oldestScore[1], 10);
				retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
			}

			return { allowed: false, remaining: 0, retryAfter };
		}

		return { allowed: true, remaining: Math.max(0, limit - currentCount) };
	} catch (err) {
		// Graceful degradation: if Redis is down, allow the request
		log.warn({ err: { message: (err as Error).message }, key }, 'Redis error, allowing request');
		return { allowed: true, remaining: limit };
	}
}
