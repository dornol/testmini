import { describe, it, expect } from 'vitest';
import { resolvePoolConfig } from './pool-config';
import type { PoolEnv } from './pool-config';

describe('resolvePoolConfig', () => {
	describe('max connections', () => {
		it('should default to 20 in production', () => {
			const config = resolvePoolConfig({}, true);
			expect(config.max).toBe(20);
		});

		it('should default to 10 in development', () => {
			const config = resolvePoolConfig({}, false);
			expect(config.max).toBe(10);
		});

		it('should respect DB_POOL_MAX env var in production', () => {
			const config = resolvePoolConfig({ DB_POOL_MAX: '50' }, true);
			expect(config.max).toBe(50);
		});

		it('should respect DB_POOL_MAX env var in development', () => {
			const config = resolvePoolConfig({ DB_POOL_MAX: '5' }, false);
			expect(config.max).toBe(5);
		});

		it('should handle DB_POOL_MAX=0', () => {
			// postgres.js treats 0 as "no limit" — valid edge case
			const config = resolvePoolConfig({ DB_POOL_MAX: '0' }, false);
			expect(config.max).toBe(0);
		});

		it('should handle DB_POOL_MAX=1', () => {
			const config = resolvePoolConfig({ DB_POOL_MAX: '1' }, false);
			expect(config.max).toBe(1);
		});
	});

	describe('idle timeout', () => {
		it('should default to 30 seconds', () => {
			const config = resolvePoolConfig({}, false);
			expect(config.idle_timeout).toBe(30);
		});

		it('should respect DB_IDLE_TIMEOUT env var', () => {
			const config = resolvePoolConfig({ DB_IDLE_TIMEOUT: '60' }, false);
			expect(config.idle_timeout).toBe(60);
		});

		it('should allow 0 to disable idle timeout', () => {
			const config = resolvePoolConfig({ DB_IDLE_TIMEOUT: '0' }, false);
			expect(config.idle_timeout).toBe(0);
		});

		it('should be same in prod and dev', () => {
			const prod = resolvePoolConfig({}, true);
			const dev = resolvePoolConfig({}, false);
			expect(prod.idle_timeout).toBe(dev.idle_timeout);
		});
	});

	describe('connect timeout', () => {
		it('should default to 10 seconds', () => {
			const config = resolvePoolConfig({}, false);
			expect(config.connect_timeout).toBe(10);
		});

		it('should respect DB_CONNECT_TIMEOUT env var', () => {
			const config = resolvePoolConfig({ DB_CONNECT_TIMEOUT: '5' }, false);
			expect(config.connect_timeout).toBe(5);
		});

		it('should allow short timeout for fast-fail scenarios', () => {
			const config = resolvePoolConfig({ DB_CONNECT_TIMEOUT: '2' }, true);
			expect(config.connect_timeout).toBe(2);
		});
	});

	describe('max lifetime', () => {
		it('should be 1800 seconds (30 minutes)', () => {
			const config = resolvePoolConfig({}, false);
			expect(config.max_lifetime).toBe(1800);
		});

		it('should be same regardless of env vars', () => {
			const config = resolvePoolConfig({ DB_POOL_MAX: '100', DB_IDLE_TIMEOUT: '120' }, true);
			expect(config.max_lifetime).toBe(1800);
		});
	});

	describe('prepared statements', () => {
		it('should be enabled', () => {
			const config = resolvePoolConfig({}, false);
			expect(config.prepare).toBe(true);
		});

		it('should be enabled in production', () => {
			const config = resolvePoolConfig({}, true);
			expect(config.prepare).toBe(true);
		});
	});

	describe('full config object', () => {
		it('should return all expected fields with defaults', () => {
			const config = resolvePoolConfig({}, false);
			expect(config).toEqual({
				max: 10,
				idle_timeout: 30,
				connect_timeout: 10,
				max_lifetime: 1800,
				prepare: true,
			});
		});

		it('should return all expected fields with env overrides', () => {
			const env: PoolEnv = {
				DB_POOL_MAX: '30',
				DB_IDLE_TIMEOUT: '45',
				DB_CONNECT_TIMEOUT: '15',
			};
			const config = resolvePoolConfig(env, true);
			expect(config).toEqual({
				max: 30,
				idle_timeout: 45,
				connect_timeout: 15,
				max_lifetime: 1800,
				prepare: true,
			});
		});

		it('should handle partial env overrides', () => {
			const config = resolvePoolConfig({ DB_POOL_MAX: '25' }, true);
			expect(config.max).toBe(25);
			expect(config.idle_timeout).toBe(30);   // default
			expect(config.connect_timeout).toBe(10); // default
		});

		it('should handle undefined env values same as empty object', () => {
			const config1 = resolvePoolConfig({}, false);
			const config2 = resolvePoolConfig({ DB_POOL_MAX: undefined, DB_IDLE_TIMEOUT: undefined, DB_CONNECT_TIMEOUT: undefined }, false);
			expect(config1).toEqual(config2);
		});
	});
});
