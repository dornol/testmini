import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	testRun,
	testExecution,
	testCaseVersion,
	testCase,
	testFailureDetail,
	user
} from '$lib/server/db/schema';
import { eq, and, inArray, count, sql } from 'drizzle-orm';
import { requireAuth, requireProjectRole } from '$lib/server/auth-utils';
import { createFailureSchema, type CreateFailureInput } from '$lib/schemas/failure.schema';
import { publish } from '$lib/server/redis';
import type { RunEvent } from '$lib/types/events';

export const load: PageServerLoad = async ({ params, parent, url }) => {
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

	// Status filter
	const statusFilter = url.searchParams.get('status') ?? '';

	// Stats are always based on full data
	const allStatuses = await db
		.select({ status: testExecution.status, cnt: count() })
		.from(testExecution)
		.where(eq(testExecution.testRunId, runId))
		.groupBy(testExecution.status);

	const stats: Record<string, number> = { total: 0, pending: 0, pass: 0, fail: 0, blocked: 0, skipped: 0 };
	for (const row of allStatuses) {
		stats[row.status.toLowerCase()] = Number(row.cnt);
		stats.total += Number(row.cnt);
	}

	// Filter executions (no pagination — virtual scroll on client)
	const execConditions = [eq(testExecution.testRunId, runId)];
	const validStatuses = ['PENDING', 'PASS', 'FAIL', 'BLOCKED', 'SKIPPED'] as const;
	if (statusFilter && validStatuses.includes(statusFilter as typeof validStatuses[number])) {
		execConditions.push(eq(testExecution.status, statusFilter as typeof validStatuses[number]));
	}

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
		.where(and(...execConditions))
		.orderBy(testCase.key);

	// Get failure details for all FAIL executions
	const failExecutionIds = executions.filter((e) => e.status === 'FAIL').map((e) => e.id);
	let failures: {
		id: number;
		testExecutionId: number;
		failureEnvironment: string | null;
		testMethod: string | null;
		errorMessage: string | null;
		stackTrace: string | null;
		comment: string | null;
		createdBy: string | null;
		createdAt: Date;
	}[] = [];

	if (failExecutionIds.length > 0) {
		failures = await db
			.select({
				id: testFailureDetail.id,
				testExecutionId: testFailureDetail.testExecutionId,
				failureEnvironment: testFailureDetail.failureEnvironment,
				testMethod: testFailureDetail.testMethod,
				errorMessage: testFailureDetail.errorMessage,
				stackTrace: testFailureDetail.stackTrace,
				comment: testFailureDetail.comment,
				createdBy: user.name,
				createdAt: testFailureDetail.createdAt
			})
			.from(testFailureDetail)
			.leftJoin(user, eq(testFailureDetail.createdBy, user.id))
			.where(inArray(testFailureDetail.testExecutionId, failExecutionIds))
			.orderBy(testFailureDetail.createdAt);
	}

	return {
		run,
		executions,
		failures,
		stats,
		statusFilter
	};
};

export const actions: Actions = {
	updateStatus: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = Number(params.projectId);
		const runId = Number(params.runId);
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

		const run = await db.query.testRun.findFirst({
			where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
		});
		if (run?.status === 'COMPLETED') {
			return fail(403, { error: 'Cannot modify executions in a completed run' });
		}

		const formData = await request.formData();
		const executionId = Number(formData.get('executionId'));
		const status = formData.get('status') as string;
		const comment = (formData.get('comment') as string) || null;

		if (!executionId || !['PASS', 'FAIL', 'BLOCKED', 'SKIPPED'].includes(status)) {
			return fail(400, { error: 'Invalid execution ID or status' });
		}

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

		await autoUpdateRunStatus(runId);

		const event: RunEvent = {
			type: 'execution:updated',
			executionId,
			status,
			executedBy: authUser.name
		};
		await publish(`run:${runId}:events`, event);

		return { success: true };
	},

	failWithDetail: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = Number(params.projectId);
		const runId = Number(params.runId);
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

		const run = await db.query.testRun.findFirst({
			where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
		});
		if (run?.status === 'COMPLETED') {
			return fail(403, { error: 'Cannot modify executions in a completed run' });
		}

		const formData = await request.formData();
		const executionId = Number(formData.get('executionId'));

		if (!executionId) {
			return fail(400, { error: 'Missing execution ID' });
		}

		const execution = await db.query.testExecution.findFirst({
			where: and(eq(testExecution.id, executionId), eq(testExecution.testRunId, runId))
		});

		if (!execution) {
			return fail(404, { error: 'Execution not found' });
		}

		const input: CreateFailureInput = {
			failureEnvironment: (formData.get('failureEnvironment') as string) || '',
			testMethod: (formData.get('testMethod') as string) || '',
			errorMessage: (formData.get('errorMessage') as string) || '',
			stackTrace: (formData.get('stackTrace') as string) || '',
			comment: (formData.get('comment') as string) || ''
		};

		const parsed = createFailureSchema.safeParse(input);
		if (!parsed.success) {
			return fail(400, { error: 'Invalid failure detail data' });
		}

		await db.transaction(async (tx) => {
			// Set execution to FAIL
			await tx
				.update(testExecution)
				.set({
					status: 'FAIL',
					executedBy: authUser.id,
					executedAt: new Date()
				})
				.where(eq(testExecution.id, executionId));

			// Create failure detail
			await tx.insert(testFailureDetail).values({
				testExecutionId: executionId,
				failureEnvironment: parsed.data.failureEnvironment || null,
				testMethod: parsed.data.testMethod || null,
				errorMessage: parsed.data.errorMessage || null,
				stackTrace: parsed.data.stackTrace || null,
				comment: parsed.data.comment || null,
				createdBy: authUser.id
			});
		});

		await autoUpdateRunStatus(runId);

		const event: RunEvent = {
			type: 'execution:updated',
			executionId,
			status: 'FAIL',
			executedBy: authUser.name
		};
		await publish(`run:${runId}:events`, event);
		await publish(`run:${runId}:events`, {
			type: 'failure:added',
			executionId
		} satisfies RunEvent);

		return { success: true };
	},

	addFailure: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = Number(params.projectId);
		const runId = Number(params.runId);
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

		const formData = await request.formData();
		const executionId = Number(formData.get('executionId'));

		if (!executionId) {
			return fail(400, { error: 'Missing execution ID' });
		}

		const execution = await db.query.testExecution.findFirst({
			where: and(
				eq(testExecution.id, executionId),
				eq(testExecution.testRunId, runId),
				eq(testExecution.status, 'FAIL')
			)
		});

		if (!execution) {
			return fail(404, { error: 'FAIL execution not found' });
		}

		const input: CreateFailureInput = {
			failureEnvironment: (formData.get('failureEnvironment') as string) || '',
			testMethod: (formData.get('testMethod') as string) || '',
			errorMessage: (formData.get('errorMessage') as string) || '',
			stackTrace: (formData.get('stackTrace') as string) || '',
			comment: (formData.get('comment') as string) || ''
		};

		const parsed = createFailureSchema.safeParse(input);
		if (!parsed.success) {
			return fail(400, { error: 'Invalid failure detail data' });
		}

		await db.insert(testFailureDetail).values({
			testExecutionId: executionId,
			failureEnvironment: parsed.data.failureEnvironment || null,
			testMethod: parsed.data.testMethod || null,
			errorMessage: parsed.data.errorMessage || null,
			stackTrace: parsed.data.stackTrace || null,
			comment: parsed.data.comment || null,
			createdBy: authUser.id
		});

		return { success: true };
	},

	updateFailure: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = Number(params.projectId);
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

		const formData = await request.formData();
		const failureId = Number(formData.get('failureId'));

		if (!failureId) {
			return fail(400, { error: 'Missing failure ID' });
		}

		const existing = await db.query.testFailureDetail.findFirst({
			where: eq(testFailureDetail.id, failureId)
		});

		if (!existing) {
			return fail(404, { error: 'Failure detail not found' });
		}

		const input: CreateFailureInput = {
			failureEnvironment: (formData.get('failureEnvironment') as string) || '',
			testMethod: (formData.get('testMethod') as string) || '',
			errorMessage: (formData.get('errorMessage') as string) || '',
			stackTrace: (formData.get('stackTrace') as string) || '',
			comment: (formData.get('comment') as string) || ''
		};

		const parsed = createFailureSchema.safeParse(input);
		if (!parsed.success) {
			return fail(400, { error: 'Invalid failure detail data' });
		}

		await db
			.update(testFailureDetail)
			.set({
				failureEnvironment: parsed.data.failureEnvironment || null,
				testMethod: parsed.data.testMethod || null,
				errorMessage: parsed.data.errorMessage || null,
				stackTrace: parsed.data.stackTrace || null,
				comment: parsed.data.comment || null
			})
			.where(eq(testFailureDetail.id, failureId));

		return { success: true };
	},

	deleteFailure: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = Number(params.projectId);
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

		const formData = await request.formData();
		const failureId = Number(formData.get('failureId'));

		if (!failureId) {
			return fail(400, { error: 'Missing failure ID' });
		}

		await db.delete(testFailureDetail).where(eq(testFailureDetail.id, failureId));

		return { success: true };
	},

	bulkPass: async ({ request, locals, params }) => {
		const authUser = requireAuth(locals);
		const projectId = Number(params.projectId);
		const runId = Number(params.runId);
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

		const run = await db.query.testRun.findFirst({
			where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
		});
		if (run?.status === 'COMPLETED') {
			return fail(403, { error: 'Cannot modify executions in a completed run' });
		}

		const formData = await request.formData();
		const executionIds = formData
			.getAll('executionIds')
			.map(Number)
			.filter((id) => !isNaN(id));

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

		const event: RunEvent = {
			type: 'executions:bulk_updated',
			executionIds,
			status: 'PASS'
		};
		await publish(`run:${runId}:events`, event);

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

		const event: RunEvent = {
			type: 'run:status_changed',
			runId,
			status
		};
		await publish(`run:${runId}:events`, event);

		return { success: true };
	}
};

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
