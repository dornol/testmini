import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testExecution, testRun } from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';
import { publish } from '$lib/server/redis';
import type { RunEvent } from '$lib/types/events';

export const PUT = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ params, request, user, projectId }) => {
	const runId = Number(params.runId);
	const executionId = Number(params.executionId);

	const body = await parseJsonBody(request) as Record<string, unknown>;
	const { status } = body as { status: string };

	if (!status || !['PASS', 'FAIL', 'BLOCKED', 'SKIPPED', 'PENDING'].includes(status)) {
		error(400, 'Invalid status');
	}

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

	await db
		.update(testExecution)
		.set({
			status: status as 'PASS' | 'FAIL' | 'BLOCKED' | 'SKIPPED' | 'PENDING',
			executedBy: user.id,
			executedAt: new Date()
		})
		.where(eq(testExecution.id, executionId));

	// Auto-update run status
	await autoUpdateRunStatus(runId);

	const event: RunEvent = {
		type: 'execution:updated',
		executionId,
		status,
		executedBy: user.name
	};
	await publish(`run:${runId}:events`, event);

	return json({ success: true, status });
});

async function autoUpdateRunStatus(runId: number) {
	// Only transition CREATED → IN_PROGRESS on first execution
	await db
		.update(testRun)
		.set({ status: 'IN_PROGRESS', startedAt: new Date() })
		.where(
			and(
				eq(testRun.id, runId),
				eq(testRun.status, 'CREATED'),
				sql`exists (select 1 from test_execution where test_run_id = ${runId} and status != 'PENDING' limit 1)`
			)
		);
}
