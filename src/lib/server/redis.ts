import Redis from 'ioredis';
import { env } from '$env/dynamic/private';
import { childLogger } from './logger';

const log = childLogger('redis');

const url = env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(url, {
	maxRetriesPerRequest: 3,
	lazyConnect: true
});

redis.on('error', (err) => {
	log.warn({ err: { message: err.message, code: (err as NodeJS.ErrnoException).code } }, 'Connection error');
});

redis.on('connect', () => {
	log.info('Connected');
});

redis.connect().catch((err) => {
	log.warn(
		{ err: { message: err.message } },
		'Initial connection failed — features like soft lock and SSE will be degraded'
	);
});

export function createSubscriber(): Redis {
	return new Redis(url, {
		maxRetriesPerRequest: 3
	});
}

export async function publish(channel: string, data: unknown): Promise<void> {
	await redis.publish(channel, JSON.stringify(data));
}
