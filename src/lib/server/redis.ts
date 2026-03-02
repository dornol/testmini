import Redis from 'ioredis';
import { env } from '$env/dynamic/private';

const url = env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(url, {
	maxRetriesPerRequest: 3,
	lazyConnect: true
});

redis.on('error', (err) => {
	console.warn('[Redis] Connection error:', err.message);
});

redis.on('connect', () => {
	console.log('[Redis] Connected');
});

redis.connect().catch((err) => {
	console.warn('[Redis] Initial connection failed:', err.message, '— features like soft lock and SSE will be degraded');
});

export function createSubscriber(): Redis {
	return new Redis(url, {
		maxRetriesPerRequest: 3
	});
}

export async function publish(channel: string, data: unknown): Promise<void> {
	await redis.publish(channel, JSON.stringify(data));
}
