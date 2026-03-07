import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and } from 'drizzle-orm';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

const client = postgres(env.DATABASE_URL);

export const db = drizzle(client, { schema });

/**
 * Fetch a test case with its latest version using manual queries
 * instead of Drizzle relational queries (which use LEFT JOIN LATERAL
 * and can fail with certain postgres.js / PostgreSQL version combos).
 */
export async function findTestCaseWithLatestVersion(
	testCaseId: number,
	projectId: number
) {
	const [tc] = await db
		.select()
		.from(schema.testCase)
		.where(and(eq(schema.testCase.id, testCaseId), eq(schema.testCase.projectId, projectId)))
		.limit(1);

	if (!tc) return null;

	const latestVersion = tc.latestVersionId
		? (await db.select().from(schema.testCaseVersion).where(eq(schema.testCaseVersion.id, tc.latestVersionId)).limit(1))[0] ?? null
		: null;

	return { ...tc, latestVersion };
}
