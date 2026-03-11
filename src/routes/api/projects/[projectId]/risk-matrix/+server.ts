import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCase } from '$lib/server/db/schema';
import { eq, and, isNotNull, sql } from 'drizzle-orm';
import { withProjectAccess } from '$lib/server/api-handler';

export const GET = withProjectAccess(async ({ projectId }) => {
	const rows = await db
		.select({
			riskImpact: testCase.riskImpact,
			riskLikelihood: testCase.riskLikelihood,
			riskLevel: testCase.riskLevel,
			count: sql<number>`count(*)::int`
		})
		.from(testCase)
		.where(
			and(
				eq(testCase.projectId, projectId),
				isNotNull(testCase.riskLevel)
			)
		)
		.groupBy(testCase.riskImpact, testCase.riskLikelihood, testCase.riskLevel);

	// Also get total and unassessed counts
	const [totals] = await db
		.select({
			total: sql<number>`count(*)::int`,
			assessed: sql<number>`count(${testCase.riskLevel})::int`
		})
		.from(testCase)
		.where(eq(testCase.projectId, projectId));

	return json({
		matrix: rows,
		total: totals?.total ?? 0,
		assessed: totals?.assessed ?? 0,
		unassessed: (totals?.total ?? 0) - (totals?.assessed ?? 0)
	});
});
