import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCase, testCaseVersion, testExecution, testRun } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { parseJsonBody, parseId } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';
import { conflict, forbidden } from '$lib/server/errors';
import { validatePositiveInteger, validateRequestBody } from '$lib/server/id-list-validation';

export const POST = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ params, request, projectId }) => {
		const runId = parseId(params.runId, 'run ID');

		const bodyOrError = validateRequestBody(await parseJsonBody(request));
		if (bodyOrError instanceof Response) return bodyOrError;

		const testCaseIdOrError = validatePositiveInteger(bodyOrError.testCaseId, 'testCaseId');
		if (testCaseIdOrError instanceof Response) return testCaseIdOrError;
		const testCaseId = testCaseIdOrError;

		const run = await db.query.testRun.findFirst({
			where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
		});
		if (!run) {
			error(404, 'Test run not found');
		}
		if (run.status === 'COMPLETED') {
			return forbidden('Cannot modify executions in a completed run');
		}

		// Verify test case belongs to project and get latest version
		const tc = await db.query.testCase.findFirst({
			where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
		});

		if (!tc || !tc.latestVersionId) {
			error(404, 'Test case not found');
		}

		// Check if execution already exists for this test case in this run
		const existing = await db
			.select({ id: testExecution.id })
			.from(testExecution)
			.innerJoin(testCaseVersion, eq(testExecution.testCaseVersionId, testCaseVersion.id))
			.where(and(eq(testExecution.testRunId, runId), eq(testCaseVersion.testCaseId, testCaseId)));

		if (existing.length > 0) {
			return conflict('Execution already exists for this test case');
		}

		const [execution] = await db
			.insert(testExecution)
			.values({
				testRunId: runId,
				testCaseVersionId: tc.latestVersionId
			})
			.returning();

		return json({ executionId: execution.id, status: 'PENDING' });
	}
);
