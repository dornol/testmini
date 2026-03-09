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

/** Resolve pool configuration from environment variables with sensible defaults. */
export function resolvePoolConfig(env: PoolEnv, isProd: boolean): PoolConfig {
	return {
		max: Number(env.DB_POOL_MAX ?? (isProd ? 20 : 10)),
		idle_timeout: Number(env.DB_IDLE_TIMEOUT ?? 30),
		connect_timeout: Number(env.DB_CONNECT_TIMEOUT ?? 10),
		max_lifetime: 60 * 30, // 30 minutes — recycle connections to avoid stale state
		prepare: true,         // prepared statements for query plan caching
	};
}
