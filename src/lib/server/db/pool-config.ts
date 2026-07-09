/**
 * Database connection pool configuration.
 * Extracted for testability and documentation.
 */

export interface PoolConfig {
	max: number;
	idle_timeout: number;
	connect_timeout: number;
	max_lifetime: number;
	prepare: boolean;
}

export interface PoolEnv {
	DB_POOL_MAX?: string;
	DB_IDLE_TIMEOUT?: string;
	DB_CONNECT_TIMEOUT?: string;
	[key: string]: string | undefined;
}

function parseNonNegativeEnvInteger(
	value: string | undefined,
	defaultValue: number,
	name: string
): number {
	if (value === undefined || value.trim() === '') return defaultValue;

	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 0) {
		throw new Error(`${name} must be a non-negative safe integer`);
	}
	return parsed;
}

/** Resolve pool configuration from environment variables with sensible defaults. */
export function resolvePoolConfig(env: PoolEnv, isProd: boolean): PoolConfig {
	return {
		max: parseNonNegativeEnvInteger(env.DB_POOL_MAX, isProd ? 20 : 10, 'DB_POOL_MAX'),
		idle_timeout: parseNonNegativeEnvInteger(env.DB_IDLE_TIMEOUT, 30, 'DB_IDLE_TIMEOUT'),
		connect_timeout: parseNonNegativeEnvInteger(env.DB_CONNECT_TIMEOUT, 10, 'DB_CONNECT_TIMEOUT'),
		max_lifetime: 60 * 30, // 30 minutes — recycle connections to avoid stale state
		prepare: true // prepared statements for query plan caching
	};
}
