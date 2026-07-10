import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testRun, testExecution, testCaseVersion, testCase } from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { parseId } from '$lib/server/auth-utils';
import { validateTestRunCopyName } from '$lib/server/test-run-copy-validation';

export const POST = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ request, params, user, projectId }) => {
		const runId = parseId(params.runId, 'run ID');

		const originalRun = await db.query.testRun.findFirst({
			where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
		});

		if (!originalRun) {
			error(404, 'Test run not found');
		}

		const nameOrError = await validateTestRunCopyName(request, `Retest of ${originalRun.name}`);
		if (nameOrError instanceof Response) return nameOrError;
		const name = nameOrError;

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
					eq(testCase.projectId, projectId),
					inArray(testExecution.status, ['FAIL', 'BLOCKED'])
				)
			);

		if (executions.length === 0) {
			error(400, 'No failed or blocked executions to retest');
		}
		if (executions.every((e) => e.latestVersionId === null)) {
			error(400, 'No failed or blocked executions with current versions to retest');
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
				.returning({ id: testRun.id });
			if (!created) {
				error(500, 'Failed to create retest run');
			}

			const executionValues = executions
				.filter((e) => e.latestVersionId !== null)
				.map((e) => ({
					testRunId: created.id,
					testCaseVersionId: e.latestVersionId!
				}));

			if (executionValues.length > 0) {
				const insertedExecutions = await tx
					.insert(testExecution)
					.values(executionValues)
					.returning({ id: testExecution.id });
				if (insertedExecutions.length !== executionValues.length) {
					error(500, 'Failed to create all retest executions');
				}
			}

			return created;
		});

		return json({ id: newRun.id });
	}
);
