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
import { csvResponse } from '$lib/server/csv-utils';
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

	const headers = [
		'Requirement ID',
		'External ID',
		'Title',
		'Source',
		'Test Case Key',
		'Test Case Title',
		'Latest Status'
	];

	const rows: (string | null | undefined)[][] = [];

	for (const req of reqs) {
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

		if (links.length === 0) {
			rows.push([
				String(req.id),
				req.externalId,
				req.title,
				req.source,
				'',
				'',
				'NO COVERAGE'
			]);
		} else {
			for (const link of links) {
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

				rows.push([
					String(req.id),
					req.externalId,
					req.title,
					req.source,
					link.key,
					link.title,
					latestExec.length > 0 ? latestExec[0].status : 'NOT EXECUTED'
				]);
			}
		}
	}

	return csvResponse(headers, rows, 'traceability_matrix.csv');
});
