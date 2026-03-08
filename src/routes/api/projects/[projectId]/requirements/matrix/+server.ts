import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	requirement,
	requirementTestCase,
	testCase,
	testCaseVersion,
	testExecution,
	testRun
} from '$lib/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { withProjectAccess } from '$lib/server/api-handler';

export const GET = withProjectAccess(async ({ projectId }) => {
	const reqs = await db
		.select({
			id: requirement.id,
			externalId: requirement.externalId,
			title: requirement.title,
			source: requirement.source
		})
		.from(requirement)
		.where(eq(requirement.projectId, projectId))
		.orderBy(requirement.id);

	const result = await Promise.all(
		reqs.map(async (req) => {
			const links = await db
				.select({
					testCaseId: requirementTestCase.testCaseId,
					key: testCase.key,
					title: testCaseVersion.title
				})
				.from(requirementTestCase)
				.innerJoin(testCase, eq(requirementTestCase.testCaseId, testCase.id))
				.innerJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
				.where(eq(requirementTestCase.requirementId, req.id))
				.orderBy(testCase.key);

			const testCases = await Promise.all(
				links.map(async (link) => {
					const latestExec = await db
						.select({ status: testExecution.status })
						.from(testExecution)
						.innerJoin(testCaseVersion, eq(testExecution.testCaseVersionId, testCaseVersion.id))
						.innerJoin(testRun, eq(testExecution.testRunId, testRun.id))
						.where(
							and(
								eq(testCaseVersion.testCaseId, link.testCaseId),
								eq(testRun.projectId, projectId)
							)
						)
						.orderBy(desc(testExecution.id))
						.limit(1);

					return {
						id: link.testCaseId,
						key: link.key,
						title: link.title,
						latestStatus: latestExec.length > 0 ? latestExec[0].status : null
					};
				})
			);

			return {
				id: req.id,
				externalId: req.externalId,
				title: req.title,
				source: req.source,
				testCases
			};
		})
	);

	return json({ requirements: result });
});
