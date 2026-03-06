import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { logger } from '$lib/server/logger';
import { env } from '$env/dynamic/private';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';

let migrated = false;

/**
 * Run pending database migrations on server startup.
 *
 * Uses a dedicated connection with max:1 (required by postgres.js migrator).
 * Idempotent — only runs once per server process.
 * Tracks applied migrations in `drizzle.__drizzle_migrations` table (like Flyway).
 *
 * On first run against an existing DB (created via db:push), automatically
 * baselines all current migrations so they are not re-applied.
 */
export async function runMigrations() {
	if (migrated) return;
	migrated = true;

	if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

	const migrationClient = postgres(env.DATABASE_URL, { max: 1 });

	try {
		await baselineIfNeeded(migrationClient);

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

/**
 * If the migration tracking table doesn't exist yet but the DB already has
 * application tables (created via db:push), mark all existing migration files
 * as already applied. This prevents re-execution of DDL that's already in place.
 */
async function baselineIfNeeded(client: postgres.Sql) {
	const [{ exists }] = await client.unsafe(`
		SELECT EXISTS (
			SELECT 1 FROM information_schema.tables
			WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'
		) AS exists
	`);

	if (exists) return;

	// Check if this is a fresh DB (no app tables) — if so, skip baseline
	const [{ app_exists }] = await client.unsafe(`
		SELECT EXISTS (
			SELECT 1 FROM information_schema.tables
			WHERE table_schema = 'public' AND table_name = 'user'
		) AS app_exists
	`);

	if (!app_exists) return;

	// DB has app tables but no migration history → baseline all existing migrations
	logger.info('Existing database detected without migration history — creating baseline');

	await client.unsafe(`CREATE SCHEMA IF NOT EXISTS drizzle`);
	await client.unsafe(`
		CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
			id SERIAL PRIMARY KEY,
			hash TEXT NOT NULL,
			created_at BIGINT
		)
	`);

	const journalPath = 'drizzle/meta/_journal.json';
	const journal = JSON.parse(readFileSync(journalPath, 'utf-8'));

	for (const entry of journal.entries) {
		const sql = readFileSync(`drizzle/${entry.tag}.sql`, 'utf-8');
		const hash = createHash('sha256').update(sql).digest('hex');
		await client.unsafe(
			`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
			[hash, entry.when]
		);
	}

	logger.info({ count: journal.entries.length }, 'Baseline migrations recorded');
}
