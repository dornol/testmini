import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { logger } from '$lib/server/logger';
import { env } from '$env/dynamic/private';

let migrated = false;

/**
 * Run pending database migrations on server startup.
 *
 * Uses a dedicated connection with max:1 (required by postgres.js migrator).
 * Idempotent — only runs once per server process.
 */
export async function runMigrations() {
	if (migrated) return;
	migrated = true;

	if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

	const migrationClient = postgres(env.DATABASE_URL, { max: 1 });

	try {
		const migrationDb = drizzle(migrationClient);
		await migrate(migrationDb, { migrationsFolder: 'drizzle' });
		logger.info('Database migrations applied successfully');
	} catch (error) {
		logger.error({ err: error }, 'Database migration failed');
		throw error;
	} finally {
		await migrationClient.end();
	}
}
