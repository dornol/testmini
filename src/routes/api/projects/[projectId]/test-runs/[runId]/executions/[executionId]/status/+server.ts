import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { testExecution, testRun } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, requireProjectRole } from '$lib/server/auth-utils';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const user = requireAuth(locals);
	const projectId = Number(params.projectId);
	const runId = Number(params.runId);
	const executionId = Number(params.executionId);

	if (isNaN(projectId) || isNaN(runId) || isNaN(executionId)) {
		error(400, 'Invalid parameters');
	}

	await requireProjectRole(user, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

	const body = await request.json();
	const { status } = body;

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

	return json({ success: true, status });
};

async function autoUpdateRunStatus(runId: number) {
	const executions = await db
		.select({ status: testExecution.status })
		.from(testExecution)
		.where(eq(testExecution.testRunId, runId));

	const allDone = executions.every((e) => e.status !== 'PENDING');
	const anyExecuted = executions.some((e) => e.status !== 'PENDING');

	const run = await db.query.testRun.findFirst({
		where: eq(testRun.id, runId)
	});

	if (!run) return;

	if (allDone && run.status !== 'COMPLETED') {
		await db
			.update(testRun)
			.set({ status: 'COMPLETED', finishedAt: new Date() })
			.where(eq(testRun.id, runId));
	} else if (anyExecuted && run.status === 'CREATED') {
		await db
			.update(testRun)
			.set({ status: 'IN_PROGRESS', startedAt: new Date() })
			.where(eq(testRun.id, runId));
	}
}
