import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testRun, testExecution, testCaseVersion, testCase } from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { parseJsonBody } from '$lib/server/auth-utils';

export const POST = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ request, params, user, projectId }) => {
	const runId = Number(params.runId);

	const originalRun = await db.query.testRun.findFirst({
		where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
	});

	if (!originalRun) {
		error(404, 'Test run not found');
	}

	const body = await parseJsonBody(request).catch(() => ({}));
	const name = (body as { name?: string }).name || `Retest of ${originalRun.name}`;

	// Get only FAIL and BLOCKED executions from the original run
	const executions = await db
		.select({
			testCaseId: testCase.id,
			latestVersionId: testCase.latestVersionId
		})
		.from(testExecution)
		.innerJoin(testCaseVersion, eq(testExecution.testCaseVersionId, testCaseVersion.id))
		.innerJoin(testCase, eq(testCaseVersion.testCaseId, testCase.id))
		.where(
			and(
				eq(testExecution.testRunId, runId),
				inArray(testExecution.status, ['FAIL', 'BLOCKED'])
			)
		);

	if (executions.length === 0) {
		error(400, 'No failed or blocked executions to retest');
	}

	const newRun = await db.transaction(async (tx) => {
		const [created] = await tx
			.insert(testRun)
			.values({
				projectId,
				name,
				environment: originalRun.environment,
				createdBy: user.id,
				retestOfRunId: runId
			})
			.returning();

		const executionValues = executions
			.filter((e) => e.latestVersionId !== null)
			.map((e) => ({
				testRunId: created.id,
				testCaseVersionId: e.latestVersionId!
			}));

		if (executionValues.length > 0) {
			await tx.insert(testExecution).values(executionValues);
		}

		return created;
	});

	return json({ id: newRun.id });
});
