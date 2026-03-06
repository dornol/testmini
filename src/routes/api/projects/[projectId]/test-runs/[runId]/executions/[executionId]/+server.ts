import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { testExecution, testRun, testFailureDetail } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, requireProjectRole } from '$lib/server/auth-utils';

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const user = requireAuth(locals);
	const projectId = Number(params.projectId);
	const runId = Number(params.runId);
	const executionId = Number(params.executionId);

	if (isNaN(projectId) || isNaN(runId) || isNaN(executionId)) {
		error(400, 'Invalid parameters');
	}

	await requireProjectRole(user, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

	// Verify run belongs to project
	const run = await db.query.testRun.findFirst({
		where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
	});

	if (!run) {
		error(404, 'Test run not found');
	}

	if (run.status === 'COMPLETED') {
		error(403, 'Cannot modify executions in a completed run');
	}

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
};
