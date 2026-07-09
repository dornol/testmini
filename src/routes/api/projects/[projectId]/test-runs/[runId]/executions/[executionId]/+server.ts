import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testExecution, testFailureDetail } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { requireEditableRun } from '$lib/server/crud-helpers';
import { parseId } from '$lib/server/auth-utils';

export const DELETE = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ params, projectId }) => {
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

		await db.transaction(async (tx) => {
			await tx.delete(testFailureDetail).where(eq(testFailureDetail.testExecutionId, executionId));
			const [deleted] = await tx
				.delete(testExecution)
				.where(and(eq(testExecution.id, executionId), eq(testExecution.testRunId, runId)))
				.returning();

			if (!deleted) {
				error(404, 'Execution not found');
			}
		});

		return json({ success: true });
	}
);
