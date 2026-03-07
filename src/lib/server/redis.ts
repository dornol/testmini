import Redis from 'ioredis';
import { env } from '$env/dynamic/private';
import { childLogger } from './logger';
import { EventEmitter } from 'events';

const log = childLogger('redis');

const redisUrl = env.REDIS_URL;

// --- Redis client (null when REDIS_URL is not set) ---

function createClient(url: string): Redis {
	const client = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true });
	client.on('error', (err) => {
		log.warn(
			{ err: { message: err.message, code: (err as NodeJS.ErrnoException).code } },
			'Connection error'
		);
	});
	client.on('connect', () => {
		log.info('Connected');
	});
	client.connect().catch((err) => {
		log.warn({ err: { message: err.message } }, 'Initial connection failed');
	});
	return client;
}

export const redis: Redis | null = redisUrl ? createClient(redisUrl) : null;

if (!redisUrl) {
	log.info('REDIS_URL not set — using in-memory fallback for lock, rate-limit, and pub/sub');
}

// --- Pub/Sub ---

export interface Subscriber {
	subscribe(channel: string): Promise<unknown>;
	on(event: 'message', listener: (channel: string, message: string) => void): void;
	unsubscribe(channel: string): Promise<unknown>;
	disconnect(): void;
}

const memoryBus = new EventEmitter();
memoryBus.setMaxListeners(100);

class MemorySubscriber implements Subscriber {
	private handlers = new Map<string, (message: string) => void>();
	private listeners: ((channel: string, message: string) => void)[] = [];

	async subscribe(channel: string) {
		const handler = (message: string) => {
			for (const listener of this.listeners) {
				listener(channel, message);
			}
		};
		this.handlers.set(channel, handler);
		memoryBus.on(channel, handler);
	}

	on(_event: 'message', listener: (channel: string, message: string) => void) {
		this.listeners.push(listener);
	}

	async unsubscribe(channel: string) {
		const handler = this.handlers.get(channel);
		if (handler) {
			memoryBus.off(channel, handler);
			this.handlers.delete(channel);
		}
	}

	disconnect() {
		for (const [channel, handler] of this.handlers) {
			memoryBus.off(channel, handler);
		}
		this.handlers.clear();
		this.listeners = [];
	}
}

export function createSubscriber(): Subscriber {
	if (redis) {
		return new Redis(redisUrl!, { maxRetriesPerRequest: 3 }) as unknown as Subscriber;
	}
	return new MemorySubscriber();
}

export async function publish(channel: string, data: unknown): Promise<void> {
	const message = JSON.stringify(data);
	if (redis) {
		await redis.publish(channel, message);
	} else {
		memoryBus.emit(channel, message);
	}
}
