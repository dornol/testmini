import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, inArray } from 'drizzle-orm';
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

/**
 * Batch fetch test cases with their latest versions.
 * Reduces N+1 queries to 2 queries total.
 */
export async function findTestCasesWithLatestVersions(
	testCaseIds: number[],
	projectId: number
) {
	if (testCaseIds.length === 0) return [];

	const tcs = await db
		.select()
		.from(schema.testCase)
		.where(and(eq(schema.testCase.projectId, projectId), inArray(schema.testCase.id, testCaseIds)));

	const versionIds = tcs.map((tc) => tc.latestVersionId).filter((id): id is number => id !== null);

	const versions = versionIds.length > 0
		? await db.select().from(schema.testCaseVersion).where(inArray(schema.testCaseVersion.id, versionIds))
		: [];

	const versionMap = new Map(versions.map((v) => [v.id, v]));

	return tcs.map((tc) => ({
		...tc,
		latestVersion: tc.latestVersionId ? versionMap.get(tc.latestVersionId) ?? null : null
	}));
}
