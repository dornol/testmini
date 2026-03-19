import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCase, testCaseVersion, testExecution } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';
import { badRequest, conflict } from '$lib/server/errors';
import { requireEditableRun } from '$lib/server/crud-helpers';

export const POST = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ params, request, projectId }) => {
	const runId = Number(params.runId);

	const body = await parseJsonBody(request);
	const { testCaseId } = body as { testCaseId: number };

	if (!testCaseId || isNaN(testCaseId)) {
		return badRequest('testCaseId is required');
	}

	await requireEditableRun(runId, projectId);

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
		.where(
			and(
				eq(testExecution.testRunId, runId),
				eq(testCaseVersion.testCaseId, testCaseId)
			)
		);

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
});
