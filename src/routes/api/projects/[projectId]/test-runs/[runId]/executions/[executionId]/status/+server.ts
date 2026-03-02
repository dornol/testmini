import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { testExecution, testRun } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, requireProjectRole, parseJsonBody } from '$lib/server/auth-utils';
import { publish } from '$lib/server/redis';
import type { RunEvent } from '$lib/types/events';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const user = requireAuth(locals);
	const projectId = Number(params.projectId);
	const runId = Number(params.runId);
	const executionId = Number(params.executionId);

	if (isNaN(projectId) || isNaN(runId) || isNaN(executionId)) {
		error(400, 'Invalid parameters');
	}

	await requireProjectRole(user, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

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
};

async function autoUpdateRunStatus(runId: number) {
	const executions = await db
		.select({ status: testExecution.status })
		.from(testExecution)
		.where(eq(testExecution.testRunId, runId));

	const anyExecuted = executions.some((e) => e.status !== 'PENDING');

	const run = await db.query.testRun.findFirst({
		where: eq(testRun.id, runId)
	});

	if (!run) return;

	if (anyExecuted && run.status === 'CREATED') {
		await db
			.update(testRun)
			.set({ status: 'IN_PROGRESS', startedAt: new Date() })
			.where(eq(testRun.id, runId));
	}
}
