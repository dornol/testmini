import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryLogger, SLOW_QUERY_THRESHOLD_MS } from './query-logger';
import type { QueryLog } from './query-logger';

function createMockLog() {
	return {
		warn: vi.fn<(meta: Record<string, unknown>, msg: string) => void>(),
		debug: vi.fn<(meta: Record<string, unknown>, msg: string) => void>()
	};
}

/** Flush all pending microtasks so queueMicrotask callbacks run. */
async function flushMicrotasks() {
	await new Promise<void>((r) => setTimeout(r, 0));
}

describe('QueryLogger', () => {
	let log: ReturnType<typeof createMockLog>;
	let logger: QueryLogger;

	beforeEach(() => {
		log = createMockLog();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('slow query detection', () => {
		it('should warn when query takes longer than threshold', async () => {
			// Mock performance.now to simulate a slow query
			let callCount = 0;
			vi.spyOn(performance, 'now').mockImplementation(() => {
				callCount++;
				// First call (in logQuery): 0, second call (in microtask): 600
				return callCount === 1 ? 0 : 600;
			});

			logger = new QueryLogger(log, false);
			logger.logQuery('SELECT * FROM users WHERE id = $1', [1]);
			await flushMicrotasks();

			expect(log.warn).toHaveBeenCalledTimes(1);
			expect(log.warn).toHaveBeenCalledWith(
				expect.objectContaining({
					durationMs: 600,
					query: 'SELECT * FROM users WHERE id = $1',
					paramCount: 1
				}),
				'slow query'
			);
		});

		it('should not warn for fast queries in dev mode', async () => {
			let callCount = 0;
			vi.spyOn(performance, 'now').mockImplementation(() => {
				callCount++;
				return callCount === 1 ? 0 : 50; // 50ms — fast
			});

			logger = new QueryLogger(log, false);
			logger.logQuery('SELECT 1', []);
			await flushMicrotasks();

			expect(log.warn).not.toHaveBeenCalled();
			expect(log.debug).toHaveBeenCalledTimes(1);
		});

		it('should use threshold of 500ms', () => {
			expect(SLOW_QUERY_THRESHOLD_MS).toBe(500);
		});

		it('should log at warn level for exactly threshold + 1', async () => {
			let callCount = 0;
			vi.spyOn(performance, 'now').mockImplementation(() => {
				callCount++;
				return callCount === 1 ? 0 : 501;
			});

			logger = new QueryLogger(log, false);
			logger.logQuery('SELECT * FROM test', []);
			await flushMicrotasks();

			expect(log.warn).toHaveBeenCalledTimes(1);
		});

		it('should log at debug level for exactly threshold', async () => {
			let callCount = 0;
			vi.spyOn(performance, 'now').mockImplementation(() => {
				callCount++;
				return callCount === 1 ? 0 : 500;
			});

			logger = new QueryLogger(log, false);
			logger.logQuery('SELECT * FROM test', []);
			await flushMicrotasks();

			expect(log.warn).not.toHaveBeenCalled();
			expect(log.debug).toHaveBeenCalledTimes(1);
		});
	});

	describe('query truncation', () => {
		it('should truncate slow query to 200 chars', async () => {
			const longQuery = 'SELECT ' + 'a'.repeat(300) + ' FROM users';
			let callCount = 0;
			vi.spyOn(performance, 'now').mockImplementation(() => {
				callCount++;
				return callCount === 1 ? 0 : 1000;
			});

			logger = new QueryLogger(log, false);
			logger.logQuery(longQuery, []);
			await flushMicrotasks();

			const loggedQuery = log.warn.mock.calls[0][0].query as string;
			expect(loggedQuery.length).toBe(200);
			expect(loggedQuery).toBe(longQuery.slice(0, 200));
		});

		it('should truncate debug query to 120 chars', async () => {
			const longQuery = 'SELECT ' + 'b'.repeat(200) + ' FROM items';
			let callCount = 0;
			vi.spyOn(performance, 'now').mockImplementation(() => {
				callCount++;
				return callCount === 1 ? 0 : 10;
			});

			logger = new QueryLogger(log, false);
			logger.logQuery(longQuery, []);
			await flushMicrotasks();

			const loggedQuery = log.debug.mock.calls[0][0].query as string;
			expect(loggedQuery.length).toBe(120);
			expect(loggedQuery).toBe(longQuery.slice(0, 120));
		});

		it('should not truncate short queries', async () => {
			const shortQuery = 'SELECT 1';
			let callCount = 0;
			vi.spyOn(performance, 'now').mockImplementation(() => {
				callCount++;
				return callCount === 1 ? 0 : 5;
			});

			logger = new QueryLogger(log, false);
			logger.logQuery(shortQuery, []);
			await flushMicrotasks();

			expect(log.debug.mock.calls[0][0].query).toBe(shortQuery);
		});
	});

	describe('param count tracking', () => {
		it('should include paramCount in slow query logs', async () => {
			let callCount = 0;
			vi.spyOn(performance, 'now').mockImplementation(() => {
				callCount++;
				return callCount === 1 ? 0 : 800;
			});

			logger = new QueryLogger(log, false);
			logger.logQuery('INSERT INTO users VALUES ($1, $2, $3)', ['a', 'b', 'c']);
			await flushMicrotasks();

			expect(log.warn.mock.calls[0][0].paramCount).toBe(3);
		});

		it('should handle empty params array', async () => {
			let callCount = 0;
			vi.spyOn(performance, 'now').mockImplementation(() => {
				callCount++;
				return callCount === 1 ? 0 : 600;
			});

			logger = new QueryLogger(log, false);
			logger.logQuery('SELECT 1', []);
			await flushMicrotasks();

			expect(log.warn.mock.calls[0][0].paramCount).toBe(0);
		});
	});

	describe('production mode', () => {
		it('should not log debug in production for fast queries', async () => {
			let callCount = 0;
			vi.spyOn(performance, 'now').mockImplementation(() => {
				callCount++;
				return callCount === 1 ? 0 : 10;
			});

			logger = new QueryLogger(log, true); // isProd = true
			logger.logQuery('SELECT * FROM users', []);
			await flushMicrotasks();

			expect(log.debug).not.toHaveBeenCalled();
			expect(log.warn).not.toHaveBeenCalled();
		});

		it('should still warn for slow queries in production', async () => {
			let callCount = 0;
			vi.spyOn(performance, 'now').mockImplementation(() => {
				callCount++;
				return callCount === 1 ? 0 : 800;
			});

			logger = new QueryLogger(log, true); // isProd = true
			logger.logQuery('SELECT * FROM large_table', [1]);
			await flushMicrotasks();

			expect(log.warn).toHaveBeenCalledTimes(1);
		});
	});

	describe('durationMs calculation', () => {
		it('should round duration to nearest integer', async () => {
			let callCount = 0;
			vi.spyOn(performance, 'now').mockImplementation(() => {
				callCount++;
				return callCount === 1 ? 0 : 123.7;
			});

			logger = new QueryLogger(log, false);
			logger.logQuery('SELECT 1', []);
			await flushMicrotasks();

			expect(log.debug.mock.calls[0][0].durationMs).toBe(124);
		});

		it('should handle sub-millisecond queries', async () => {
			let callCount = 0;
			vi.spyOn(performance, 'now').mockImplementation(() => {
				callCount++;
				return callCount === 1 ? 0 : 0.3;
			});

			logger = new QueryLogger(log, false);
			logger.logQuery('SELECT 1', []);
			await flushMicrotasks();

			expect(log.debug.mock.calls[0][0].durationMs).toBe(0);
		});
	});

	describe('multiple queries', () => {
		it('should log each query independently', async () => {
			// Test that multiple queries are logged separately
			let callCount = 0;
			vi.spyOn(performance, 'now').mockImplementation(() => {
				callCount++;
				// logQuery calls: 1, 2, 3; microtask calls: 4, 5, 6
				// First query: start=0, end=10 → fast (10ms)
				// Second query: start=100, end=700 → slow (600ms)
				// Third query: start=800, end=820 → fast (20ms)
				const times = [0, 100, 800, 10, 700, 820];
				return times[callCount - 1] ?? 0;
			});

			logger = new QueryLogger(log, false);
			logger.logQuery('SELECT 1', []);
			logger.logQuery('SELECT * FROM huge_table', []);
			logger.logQuery('SELECT 2', []);
			await flushMicrotasks();

			expect(log.debug).toHaveBeenCalledTimes(2); // two fast queries
			expect(log.warn).toHaveBeenCalledTimes(1); // one slow query
		});
	});
});
