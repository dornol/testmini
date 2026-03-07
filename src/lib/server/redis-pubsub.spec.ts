import { describe, it, expect, vi } from 'vitest';

// Mock Redis as unavailable (no REDIS_URL) to test in-memory pub/sub
vi.mock('ioredis', () => {
	function RedisMock() {
		return {};
	}
	return { default: RedisMock };
});
vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/server/logger', () => ({
	childLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

const { publish, createSubscriber, redis } = await import('$lib/server/redis');

describe('redis.ts (in-memory fallback)', () => {
	it('should have redis set to null when REDIS_URL is not set', () => {
		expect(redis).toBeNull();
	});

	describe('in-memory pub/sub', () => {
		it('should deliver messages to subscriber', async () => {
			const subscriber = createSubscriber();
			const received: string[] = [];

			subscriber.on('message', (_ch: string, message: string) => {
				received.push(message);
			});

			await subscriber.subscribe('test-channel');
			await publish('test-channel', { type: 'hello', value: 42 });

			expect(received).toHaveLength(1);
			expect(JSON.parse(received[0])).toEqual({ type: 'hello', value: 42 });

			subscriber.disconnect();
		});

		it('should not receive messages after unsubscribe', async () => {
			const subscriber = createSubscriber();
			const received: string[] = [];

			subscriber.on('message', (_ch, msg) => received.push(msg));

			await subscriber.subscribe('test-channel-2');
			await publish('test-channel-2', { msg: 'before' });

			await subscriber.unsubscribe('test-channel-2');
			await publish('test-channel-2', { msg: 'after' });

			expect(received).toHaveLength(1);
			expect(JSON.parse(received[0])).toEqual({ msg: 'before' });

			subscriber.disconnect();
		});

		it('should not receive messages after disconnect', async () => {
			const subscriber = createSubscriber();
			const received: string[] = [];

			subscriber.on('message', (_ch, msg) => received.push(msg));

			await subscriber.subscribe('test-channel-3');
			subscriber.disconnect();

			await publish('test-channel-3', { msg: 'should not arrive' });

			expect(received).toHaveLength(0);
		});

		it('should isolate subscribers on different channels', async () => {
			const sub1 = createSubscriber();
			const sub2 = createSubscriber();
			const received1: string[] = [];
			const received2: string[] = [];

			sub1.on('message', (_ch, msg) => received1.push(msg));
			sub2.on('message', (_ch, msg) => received2.push(msg));

			await sub1.subscribe('channel-a');
			await sub2.subscribe('channel-b');

			await publish('channel-a', { target: 'a' });
			await publish('channel-b', { target: 'b' });

			expect(received1).toHaveLength(1);
			expect(JSON.parse(received1[0])).toEqual({ target: 'a' });

			expect(received2).toHaveLength(1);
			expect(JSON.parse(received2[0])).toEqual({ target: 'b' });

			sub1.disconnect();
			sub2.disconnect();
		});

		it('should deliver to multiple subscribers on the same channel', async () => {
			const sub1 = createSubscriber();
			const sub2 = createSubscriber();
			const received1: string[] = [];
			const received2: string[] = [];

			sub1.on('message', (_ch, msg) => received1.push(msg));
			sub2.on('message', (_ch, msg) => received2.push(msg));

			await sub1.subscribe('shared-channel');
			await sub2.subscribe('shared-channel');

			await publish('shared-channel', { broadcast: true });

			expect(received1).toHaveLength(1);
			expect(received2).toHaveLength(1);

			sub1.disconnect();
			sub2.disconnect();
		});

		it('should pass the correct channel name to the listener', async () => {
			const subscriber = createSubscriber();
			let receivedChannel = '';

			subscriber.on('message', (ch: string) => {
				receivedChannel = ch;
			});

			await subscriber.subscribe('my-channel');
			await publish('my-channel', { data: 1 });

			expect(receivedChannel).toBe('my-channel');

			subscriber.disconnect();
		});
	});
});
