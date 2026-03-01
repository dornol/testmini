import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	testRun,
	testExecution,
	testCaseVersion,
	testCase,
	user
} from '$lib/server/db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { requireAuth, requireProjectRole } from '$lib/server/auth-utils';

export const load: PageServerLoad = async ({ params, parent }) => {
	await parent();
	const projectId = Number(params.projectId);
	const runId = Number(params.runId);

	if (isNaN(runId)) {
		error(400, 'Invalid run ID');
	}

	const run = await db.query.testRun.findFirst({
		where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
	});

	if (!run) {
		error(404, 'Test run not found');
	}

	// Get executions with test case info
	const executions = await db
		.select({
			id: testExecution.id,
			status: testExecution.status,
			comment: testExecution.comment,
			executedBy: user.name,
			executedAt: testExecution.executedAt,
			testCaseKey: testCase.key,
			testCaseTitle: testCaseVersion.title,
			testCasePriority: testCaseVersion.priority,
			versionNo: testCaseVersion.versionNo
		})
		.from(testExecution)
		.innerJoin(testCaseVersion, eq(testExecution.testCaseVersionId, testCaseVersion.id))
		.innerJoin(testCase, eq(testCaseVersion.testCaseId, testCase.id))
		.leftJoin(user, eq(testExecution.executedBy, user.id))
		.where(eq(testExecution.testRunId, runId))
		.orderBy(testCase.key);

	// Compute progress stats
	const stats = {
		total: executions.length,
		pending: executions.filter((e) => e.status === 'PENDING').length,
		pass: executions.filter((e) => e.status === 'PASS').length,
		fail: executions.filter((e) => e.status === 'FAIL').length,
		blocked: executions.filter((e) => e.status === 'BLOCKED').length,
		skipped: executions.filter((e) => e.status === 'SKIPPED').length
	};

	return { run, executions, stats };
};

export const actions: Actions = {
	updateStatus: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = Number(params.projectId);
		const runId = Number(params.runId);
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

		const formData = await request.formData();
		const executionId = Number(formData.get('executionId'));
		const status = formData.get('status') as string;
		const comment = (formData.get('comment') as string) || null;

		if (!executionId || !['PASS', 'FAIL', 'BLOCKED', 'SKIPPED'].includes(status)) {
			return fail(400, { error: 'Invalid execution ID or status' });
		}

		// Verify execution belongs to this run
		const execution = await db.query.testExecution.findFirst({
			where: and(eq(testExecution.id, executionId), eq(testExecution.testRunId, runId))
		});

		if (!execution) {
			return fail(404, { error: 'Execution not found' });
		}

		await db
			.update(testExecution)
			.set({
				status: status as 'PASS' | 'FAIL' | 'BLOCKED' | 'SKIPPED',
				comment,
				executedBy: authUser.id,
				executedAt: new Date()
			})
			.where(eq(testExecution.id, executionId));

		// Auto-update run status
		await autoUpdateRunStatus(runId);

		return { success: true };
	},

	bulkPass: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = Number(params.projectId);
		const runId = Number(params.runId);
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

		const formData = await request.formData();
		const executionIds = formData.getAll('executionIds').map(Number).filter((id) => !isNaN(id));

		if (executionIds.length === 0) {
			return fail(400, { error: 'No executions selected' });
		}

		await db
			.update(testExecution)
			.set({
				status: 'PASS',
				executedBy: authUser.id,
				executedAt: new Date()
			})
			.where(
				and(
					eq(testExecution.testRunId, runId),
					inArray(testExecution.id, executionIds),
					eq(testExecution.status, 'PENDING')
				)
			);

		await autoUpdateRunStatus(runId);

		return { success: true };
	},

	updateRunStatus: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = Number(params.projectId);
		const runId = Number(params.runId);
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

		const formData = await request.formData();
		const status = formData.get('status') as string;

		if (!['IN_PROGRESS', 'COMPLETED'].includes(status)) {
			return fail(400, { error: 'Invalid status' });
		}

		const updates: Record<string, unknown> = {
			status: status as 'IN_PROGRESS' | 'COMPLETED'
		};

		if (status === 'IN_PROGRESS') {
			updates.startedAt = new Date();
		} else if (status === 'COMPLETED') {
			updates.finishedAt = new Date();
		}

		await db
			.update(testRun)
			.set(updates)
			.where(and(eq(testRun.id, runId), eq(testRun.projectId, projectId)));

		return { success: true };
	}
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
