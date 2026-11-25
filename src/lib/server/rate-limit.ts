import { redis } from './redis';
import { childLogger } from './logger';
import { createHash } from 'node:crypto';
import { redactSecrets } from './secret-redaction';

const log = childLogger('rate-limit');

export interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	retryAfter?: number;
}

/**
 * Multiplier for every rate limit, read from RATE_LIMIT_MULTIPLIER.
 * Only the E2E server sets it, because a single browser session shares one IP and
 * exceeds the per-minute budget. Missing, invalid or below-1 values mean 1, so a
 * typo can never make production limits stricter or looser by accident.
 */
export function rateLimitMultiplier(raw: string | undefined = process.env.RATE_LIMIT_MULTIPLIER) {
	const value = Number(raw);
	return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;
}

// --- In-memory fallback ---

const memWindows = new Map<string, number[]>();

function hashRateLimitKey(key: string): string {
	return createHash('sha256').update(key).digest('hex').slice(0, 16);
}

function sanitizeRedisError(err: unknown): { message: string; name?: string } | string {
	if (err instanceof Error) {
		return {
			name: err.name,
			message: redactSecrets(err.message)
		};
	}

	return redactSecrets(String(err));
}

function checkRateLimitMemory(key: string, limit: number, windowMs: number): RateLimitResult {
	const now = Date.now();
	const windowStart = now - windowMs;

	let timestamps = memWindows.get(key) ?? [];
	timestamps = timestamps.filter((t) => t > windowStart);

	if (timestamps.length >= limit) {
		memWindows.set(key, timestamps);
		const retryAfter =
			timestamps.length > 0
				? Math.max(1, Math.ceil((timestamps[0] + windowMs - now) / 1000))
				: Math.ceil(windowMs / 1000);
		return { allowed: false, remaining: 0, retryAfter };
	}

	timestamps.push(now);
	memWindows.set(key, timestamps);
	return { allowed: true, remaining: Math.max(0, limit - timestamps.length) };
}

// --- Redis sliding window ---

/**
 * Sliding window rate limiter.
 * Uses Redis sorted sets when available, falls back to in-memory Map.
 */
export async function checkRateLimit(
	key: string,
	limit: number,
	windowMs: number
): Promise<RateLimitResult> {
	if (!redis) {
		return checkRateLimitMemory(key, limit, windowMs);
	}

	const now = Date.now();
	const windowStart = now - windowMs;
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
			return { allowed: true, remaining: limit };
		}

		const [cardErr, count] = results[2] as [Error | null, number];

		if (cardErr) {
			log.warn(
				{ err: sanitizeRedisError(cardErr), keyHash: hashRateLimitKey(key) },
				'Redis ZCARD error'
			);
			return { allowed: true, remaining: limit };
		}

		const currentCount = count as number;

		if (currentCount > limit) {
			// Undo the member we just added — the request is being rejected
			await redis.zrem(redisKey, member).catch(() => {});

			// Estimate when the oldest entry in the window will expire
			const oldestScore = await redis.zrange(redisKey, 0, 0, 'WITHSCORES').catch(() => null);

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
		log.warn(
			{ err: sanitizeRedisError(err), keyHash: hashRateLimitKey(key) },
			'Redis error, allowing request'
		);
		return { allowed: true, remaining: limit };
	}
}
