import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks (available before any module loads)
// ---------------------------------------------------------------------------

const { mockOn, mockConnect, mockPublish } = vi.hoisted(() => ({
	mockOn: vi.fn(),
	mockConnect: vi.fn().mockResolvedValue(undefined),
	mockPublish: vi.fn().mockResolvedValue(1)
}));

vi.mock('ioredis', () => {
	function RedisMock() {
		return {
			on: mockOn,
			connect: mockConnect,
			publish: mockPublish
		};
	}
	return { default: RedisMock };
});

vi.mock('$lib/server/logger', () => ({
	childLogger: () => ({
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

// ---------------------------------------------------------------------------
// Test: without REDIS_URL (in-memory fallback)
// ---------------------------------------------------------------------------

// For the no-REDIS_URL tests, set the mock once at the top level
vi.mock('$env/dynamic/private', () => ({ env: {} }));

const { redis, publish, createSubscriber } = await import('$lib/server/redis');

describe('redis module (no REDIS_URL)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should export redis as null when REDIS_URL is not set', () => {
		expect(redis).toBeNull();
	});

	it('should create a MemorySubscriber when redis is null', () => {
		const sub = createSubscriber();

		expect(sub).toBeDefined();
		expect(typeof sub.subscribe).toBe('function');
		expect(typeof sub.on).toBe('function');
		expect(typeof sub.unsubscribe).toBe('function');
		expect(typeof sub.disconnect).toBe('function');
	});

	it('should publish via in-memory EventEmitter when redis is null', async () => {
		const sub = createSubscriber();
		const received: { channel: string; message: string }[] = [];

		sub.on('message', (channel, message) => {
			received.push({ channel, message });
		});
		await sub.subscribe('test-channel');

		await publish('test-channel', { foo: 'bar' });

		expect(received).toHaveLength(1);
		expect(received[0].channel).toBe('test-channel');
		expect(JSON.parse(received[0].message)).toEqual({ foo: 'bar' });
	});

	it('should not deliver messages after unsubscribe', async () => {
		const sub = createSubscriber();
		const received: string[] = [];

		sub.on('message', (_ch, msg) => received.push(msg));
		await sub.subscribe('ch1');
		await publish('ch1', 'msg1');
		expect(received).toHaveLength(1);

		await sub.unsubscribe('ch1');
		await publish('ch1', 'msg2');
		expect(received).toHaveLength(1); // no new message
	});

	it('should not deliver messages after disconnect', async () => {
		const sub = createSubscriber();
		const received: string[] = [];

		sub.on('message', (_ch, msg) => received.push(msg));
		await sub.subscribe('ch2');
		await publish('ch2', 'before');
		expect(received).toHaveLength(1);

		sub.disconnect();
		await publish('ch2', 'after');
		expect(received).toHaveLength(1);
	});

	it('should isolate different channels in MemorySubscriber', async () => {
		const sub = createSubscriber();
		const received: { channel: string; message: string }[] = [];

		sub.on('message', (channel, message) => {
			received.push({ channel, message });
		});
		await sub.subscribe('ch-a');
		// Do not subscribe to ch-b

		await publish('ch-a', 'hello');
		await publish('ch-b', 'world');

		expect(received).toHaveLength(1);
		expect(received[0].channel).toBe('ch-a');
	});

	it('should support multiple listeners on MemorySubscriber', async () => {
		const sub = createSubscriber();
		const received1: string[] = [];
		const received2: string[] = [];

		sub.on('message', (_ch, msg) => received1.push(msg));
		sub.on('message', (_ch, msg) => received2.push(msg));
		await sub.subscribe('multi');

		await publish('multi', 'data');

		expect(received1).toHaveLength(1);
		expect(received2).toHaveLength(1);
	});

	it('should serialize data as JSON when publishing', async () => {
		const sub = createSubscriber();
		const received: string[] = [];

		sub.on('message', (_ch, msg) => received.push(msg));
		await sub.subscribe('json-ch');

		const complexData = { nested: { arr: [1, 2], flag: true }, str: 'test' };
		await publish('json-ch', complexData);

		expect(JSON.parse(received[0])).toEqual(complexData);
	});

	it('should not call Redis constructor when REDIS_URL is absent', () => {
		// mockConnect should never have been called (no redis client created)
		expect(mockConnect).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Test: with REDIS_URL (redis client)
// These use resetModules + doMock to force re-evaluation with REDIS_URL set
// ---------------------------------------------------------------------------

describe('redis module (with REDIS_URL)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	async function importRedisWithUrl() {
		vi.doMock('$env/dynamic/private', () => ({
			env: { REDIS_URL: 'redis://localhost:6379' }
		}));
		return import('$lib/server/redis');
	}

	it('should export a redis client when REDIS_URL is set', async () => {
		const mod = await importRedisWithUrl();

		expect(mod.redis).not.toBeNull();
		expect(mockConnect).toHaveBeenCalled();
	});

	it('should register error and connect event handlers', async () => {
		await importRedisWithUrl();

		const eventNames = mockOn.mock.calls.map((c: unknown[]) => c[0]);
		expect(eventNames).toContain('error');
		expect(eventNames).toContain('connect');
	});

	it('should publish via redis.publish when redis is available', async () => {
		const mod = await importRedisWithUrl();

		await mod.publish('my-channel', { event: 'update' });

		expect(mockPublish).toHaveBeenCalledWith('my-channel', JSON.stringify({ event: 'update' }));
	});

	it('should create a new Redis instance for subscriber', async () => {
		const mod = await importRedisWithUrl();

		const sub = mod.createSubscriber();

		expect(sub).toBeDefined();
		expect(typeof sub.on).toBe('function');
	});

	it('should handle initial connection failure gracefully', async () => {
		mockConnect.mockRejectedValueOnce(new Error('Connection refused'));

		// Should not throw during import
		const mod = await importRedisWithUrl();
		expect(mod.redis).not.toBeNull();
	});
});
