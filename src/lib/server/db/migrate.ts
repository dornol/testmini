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
 * Verify that every .sql file in the drizzle folder has a matching journal entry,
 * and that journal timestamps are strictly ascending (drizzle skips migrations
 * whose `when` is <= the last applied migration's created_at).
 */
function checkMigrationIntegrity(migrationsFolder: string) {
	const journalPath = resolve(migrationsFolder, 'meta', '_journal.json');
	const journal = JSON.parse(readFileSync(journalPath, 'utf-8'));
	const entries = journal.entries as { tag: string; when: number; idx: number }[];
	const registeredTags = new Set<string>(entries.map((e) => e.tag));

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

	// Verify timestamps are strictly ascending — drizzle compares `when` against
	// the last DB migration's created_at and silently skips if when <= created_at
	for (let i = 1; i < entries.length; i++) {
		if (entries[i].when <= entries[i - 1].when) {
			const msg = `Migration timestamp order violation: ${entries[i].tag} (when=${entries[i].when}) ` +
				`<= ${entries[i - 1].tag} (when=${entries[i - 1].when}). ` +
				`Drizzle will silently skip this migration. Fix the "when" value in _journal.json.`;
			logger.error(msg);
			throw new Error(msg);
		}
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

	if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

	const migrationsFolder = 'drizzle';
	checkMigrationIntegrity(migrationsFolder);

	const migrationClient = postgres(env.DATABASE_URL, { max: 1 });

	try {
		const migrationDb = drizzle(migrationClient);
		await migrate(migrationDb, { migrationsFolder });

		// Verify: DB migration count must match journal entry count
		const journalPath = resolve(migrationsFolder, 'meta', '_journal.json');
		const journal = JSON.parse(readFileSync(journalPath, 'utf-8'));
		const expectedCount = journal.entries.length;
		const [{ count }] = await migrationClient`
			SELECT count(*)::int as count FROM drizzle.__drizzle_migrations
		`;
		if (count < expectedCount) {
			const msg = `Migration verification failed: DB has ${count} migrations but journal has ${expectedCount} entries. ` +
				`Some migrations were silently skipped. Check journal "when" timestamps are strictly ascending.`;
			logger.error(msg);
			throw new Error(msg);
		}

		g[key] = true;
		logger.info({ applied: expectedCount }, 'Database migrations applied successfully');
	} catch (error) {
		logger.error({ err: error }, 'Database migration failed');
		throw error;
	} finally {
		await migrationClient.end();
	}
}
