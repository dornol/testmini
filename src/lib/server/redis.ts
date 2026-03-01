import Redis from 'ioredis';
import { env } from '$env/dynamic/private';

const url = env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(url, {
	maxRetriesPerRequest: 3,
	lazyConnect: true
});

redis.connect().catch(() => {
	// Silently handle initial connection failure; ioredis will auto-reconnect
});

export function createSubscriber(): Redis {
	return new Redis(url, {
		maxRetriesPerRequest: 3
	});
}

export async function publish(channel: string, data: unknown): Promise<void> {
	await redis.publish(channel, JSON.stringify(data));
}
