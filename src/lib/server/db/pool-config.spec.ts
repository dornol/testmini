import { describe, it, expect } from 'vitest';
import { resolvePoolConfig } from './pool-config';

describe('resolvePoolConfig', () => {
	it('should return production defaults when isProd is true', () => {
		const config = resolvePoolConfig({}, true);

		expect(config.max).toBe(20);
		expect(config.idle_timeout).toBe(30);
		expect(config.connect_timeout).toBe(10);
		expect(config.max_lifetime).toBe(1800);
		expect(config.prepare).toBe(true);
	});

	it('should return development defaults when isProd is false', () => {
		const config = resolvePoolConfig({}, false);

		expect(config.max).toBe(10);
		expect(config.idle_timeout).toBe(30);
		expect(config.connect_timeout).toBe(10);
		expect(config.max_lifetime).toBe(1800);
		expect(config.prepare).toBe(true);
	});

	it('should override max from DB_POOL_MAX env', () => {
		const config = resolvePoolConfig({ DB_POOL_MAX: '50' }, true);

		expect(config.max).toBe(50);
	});

	it('should override idle_timeout from DB_IDLE_TIMEOUT env', () => {
		const config = resolvePoolConfig({ DB_IDLE_TIMEOUT: '60' }, false);

		expect(config.idle_timeout).toBe(60);
	});

	it('should override connect_timeout from DB_CONNECT_TIMEOUT env', () => {
		const config = resolvePoolConfig({ DB_CONNECT_TIMEOUT: '5' }, false);

		expect(config.connect_timeout).toBe(5);
	});

	it('should handle all env vars together', () => {
		const config = resolvePoolConfig({
			DB_POOL_MAX: '30',
			DB_IDLE_TIMEOUT: '45',
			DB_CONNECT_TIMEOUT: '15'
		}, true);

		expect(config.max).toBe(30);
		expect(config.idle_timeout).toBe(45);
		expect(config.connect_timeout).toBe(15);
	});

	it('should return NaN for non-numeric env values', () => {
		const config = resolvePoolConfig({ DB_POOL_MAX: 'abc' }, false);

		expect(config.max).toBeNaN();
	});

	it('should always set max_lifetime to 1800', () => {
		const config = resolvePoolConfig({}, false);

		expect(config.max_lifetime).toBe(60 * 30);
	});

	it('should always set prepare to true', () => {
		const config = resolvePoolConfig({}, true);

		expect(config.prepare).toBe(true);
	});

	it('should use prod default for max when DB_POOL_MAX is undefined in prod', () => {
		const config = resolvePoolConfig({ DB_POOL_MAX: undefined }, true);

		expect(config.max).toBe(20);
	});
});
