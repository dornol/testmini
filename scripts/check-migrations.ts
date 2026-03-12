/**
 * Verify that every .sql file in drizzle/ has a matching entry in _journal.json.
 * Run as part of CI or pre-build to catch unregistered migrations early.
 *
 * Usage: npx tsx scripts/check-migrations.ts
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const drizzleDir = join(import.meta.dirname ?? '.', '..', 'drizzle');
const journalPath = join(drizzleDir, 'meta', '_journal.json');

const journal = JSON.parse(readFileSync(journalPath, 'utf-8'));
const journalTags = new Set<string>(journal.entries.map((e: { tag: string }) => e.tag));

const sqlFiles = readdirSync(drizzleDir)
	.filter((f) => f.endsWith('.sql'))
	.map((f) => f.replace('.sql', ''));

const missing = sqlFiles.filter((tag) => !journalTags.has(tag));
const orphaned = [...journalTags].filter((tag) => !sqlFiles.includes(tag));

let failed = false;

if (missing.length > 0) {
	console.error('ERROR: SQL files not registered in _journal.json:');
	missing.forEach((t) => console.error(`  - ${t}.sql`));
	console.error('\nFix: Use "pnpm db:generate" instead of creating SQL files manually.');
	console.error('Or manually add entries to drizzle/meta/_journal.json.\n');
	failed = true;
}

if (orphaned.length > 0) {
	console.error('WARNING: Journal entries with no matching SQL file:');
	orphaned.forEach((t) => console.error(`  - ${t}`));
	failed = true;
}

if (!failed) {
	console.log(`OK: All ${sqlFiles.length} migrations are registered in the journal.`);
} else {
	process.exit(1);
}
