import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { logger } from '$lib/server/logger';
import { env } from '$env/dynamic/private';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Track migration state globally so HMR doesn't skip new migrations
const key = Symbol.for('__drizzle_migrated');
const g = globalThis as Record<symbol, boolean>;

/**
 * Verify that every .sql file in the drizzle folder has a matching journal entry.
 * Catches the common mistake of manually creating SQL files without `pnpm db:generate`.
 */
function checkMigrationIntegrity(migrationsFolder: string) {
	const journalPath = resolve(migrationsFolder, 'meta', '_journal.json');
	const journal = JSON.parse(readFileSync(journalPath, 'utf-8'));
	const registeredTags = new Set<string>(
		journal.entries.map((e: { tag: string }) => e.tag)
	);

	const sqlFiles = readdirSync(migrationsFolder)
		.filter((f) => f.endsWith('.sql'))
		.map((f) => f.replace('.sql', ''));

	const unregistered = sqlFiles.filter((f) => !registeredTags.has(f));

	if (unregistered.length > 0) {
		const msg = `Unregistered migration files found: ${unregistered.join(', ')}. ` +
			`These will NOT be applied. Use "pnpm db:generate" to create migrations properly, ` +
			`or add entries to drizzle/meta/_journal.json manually.`;
		logger.error(msg);
		throw new Error(msg);
	}
}

/**
 * Run pending database migrations on server startup.
 *
 * Uses a dedicated connection with max:1 (required by postgres.js migrator).
 * Idempotent — only runs once per server process (survives HMR via globalThis symbol).
 */
export async function runMigrations() {
	if (g[key]) return;
	g[key] = true;

	if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

	const migrationsFolder = 'drizzle';
	checkMigrationIntegrity(migrationsFolder);

	const migrationClient = postgres(env.DATABASE_URL, { max: 1 });

	try {
		const migrationDb = drizzle(migrationClient);
		await migrate(migrationDb, { migrationsFolder });
		logger.info('Database migrations applied successfully');
	} catch (error) {
		logger.error({ err: error }, 'Database migration failed');
		throw error;
	} finally {
		await migrationClient.end();
	}
}
