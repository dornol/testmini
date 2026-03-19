import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testExecution, testFailureDetail } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { requireEditableRun } from '$lib/server/crud-helpers';
import { parseId } from '$lib/server/auth-utils';

export const DELETE = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ params, projectId }) => {
	const runId = parseId(params.runId, 'run ID');
	const executionId = parseId(params.executionId, 'execution ID');

	await requireEditableRun(runId, projectId);

	// Verify execution belongs to run
	const execution = await db.query.testExecution.findFirst({
		where: and(eq(testExecution.id, executionId), eq(testExecution.testRunId, runId))
	});

	if (!execution) {
		error(404, 'Execution not found');
	}

	// Delete related failures first, then the execution
	await db.delete(testFailureDetail).where(eq(testFailureDetail.testExecutionId, executionId));
	await db.delete(testExecution).where(eq(testExecution.id, executionId));

	return json({ success: true });
});
