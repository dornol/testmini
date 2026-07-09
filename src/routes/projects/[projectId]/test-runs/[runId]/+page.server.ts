import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	testRun,
	testExecution,
	testCaseVersion,
	testCase,
	testFailureDetail,
	projectMember,
	user
} from '$lib/server/db/schema';
import { eq, and, inArray, count, sql } from 'drizzle-orm';
import { requireAuth, requireProjectRole, parseId } from '$lib/server/auth-utils';
import { createFailureSchema, type CreateFailureInput } from '$lib/schemas/failure.schema';
import { publishRunEvent } from '$lib/server/run-events';
import { createNotification } from '$lib/server/notifications';
import type { RunEvent } from '$lib/types/events';
import { parsePositiveFormId } from '$lib/server/form-utils';
import { assertContentLengthUnderLimit } from '$lib/server/request-size';

// ── Local helpers ──────────────────────────────────────────────────

const MAX_TEST_RUN_ACTION_FORM_BODY_SIZE = 64 * 1024;
const EXECUTION_STATUSES = ['PASS', 'FAIL', 'BLOCKED', 'SKIPPED'] as const;
const RUN_STATUSES = ['IN_PROGRESS', 'COMPLETED'] as const;
const MAX_EXECUTION_COMMENT_LENGTH = 2000;
const FAILURE_FIELD_LIMITS = {
	failureEnvironment: 200,
	testMethod: 500,
	errorMessage: 2000,
	stackTrace: 10000,
	comment: 2000
} as const;

function assertTestRunActionFormBodySize(request: Request): void {
	assertContentLengthUnderLimit(
		request,
		MAX_TEST_RUN_ACTION_FORM_BODY_SIZE,
		'Test run action form body is too large'
	);
}

function parseEnumValue<T extends readonly string[]>(
	value: FormDataEntryValue | null,
	allowed: T
): T[number] | null {
	return typeof value === 'string' && allowed.includes(value) ? value : null;
}

function parseOptionalText(value: FormDataEntryValue | null, maxLength: number): string | null {
	if (value === null) return '';
	if (typeof value !== 'string') return null;
	if (value.length > maxLength || /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(value)) {
		return null;
	}
	return value;
}

async function getActionContext(locals: App.Locals, params: Record<string, string>) {
	const authUser = requireAuth(locals);
	const projectId = parseId(params.projectId, 'project ID');
	const runId = parseId(params.runId, 'run ID');
	await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);
	return { authUser, projectId, runId };
}

async function requireEditableRun(projectId: number, runId: number) {
	const run = await db.query.testRun.findFirst({
		where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
	});
	if (!run) {
		return fail(404, { error: 'Test run not found' });
	}
	if (run?.status === 'COMPLETED') {
		return fail(403, { error: 'Cannot modify executions in a completed run' });
	}
	return null;
}

async function requireRunInProject(projectId: number, runId: number) {
	const run = await db.query.testRun.findFirst({
		where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
	});
	if (!run) {
		return fail(404, { error: 'Test run not found' });
	}
	return null;
}

function parseFailureFormData(formData: FormData): CreateFailureInput | null {
	const failureEnvironment = parseOptionalText(
		formData.get('failureEnvironment'),
		FAILURE_FIELD_LIMITS.failureEnvironment
	);
	const testMethod = parseOptionalText(formData.get('testMethod'), FAILURE_FIELD_LIMITS.testMethod);
	const errorMessage = parseOptionalText(
		formData.get('errorMessage'),
		FAILURE_FIELD_LIMITS.errorMessage
	);
	const stackTrace = parseOptionalText(formData.get('stackTrace'), FAILURE_FIELD_LIMITS.stackTrace);
	const comment = parseOptionalText(formData.get('comment'), FAILURE_FIELD_LIMITS.comment);

	if (
		failureEnvironment === null ||
		testMethod === null ||
		errorMessage === null ||
		stackTrace === null ||
		comment === null
	) {
		return null;
	}

	return { failureEnvironment, testMethod, errorMessage, stackTrace, comment };
}

// ── Load ───────────────────────────────────────────────────────────

export const load: PageServerLoad = async ({ params, parent, url, locals }) => {
	await parent();
	const authUser = requireAuth(locals);
	const projectId = parseId(params.projectId, 'project ID');
	const runId = parseId(params.runId, 'run ID');

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

	const stats = { total: 0, pending: 0, pass: 0, fail: 0, blocked: 0, skipped: 0 } as {
		total: number;
		pending: number;
		pass: number;
		fail: number;
		blocked: number;
		skipped: number;
		[key: string]: number;
	};
	for (const row of allStatuses) {
		stats[row.status.toLowerCase()] = Number(row.cnt);
		stats.total += Number(row.cnt);
	}

	// Filter executions (no pagination — virtual scroll on client)
	const execConditions = [eq(testExecution.testRunId, runId)];
	const validStatuses = ['PENDING', 'PASS', 'FAIL', 'BLOCKED', 'SKIPPED'] as const;
	if (statusFilter && validStatuses.includes(statusFilter as (typeof validStatuses)[number])) {
		execConditions.push(eq(testExecution.status, statusFilter as (typeof validStatuses)[number]));
	}

	const executions = await db
		.select({
			id: testExecution.id,
			status: testExecution.status,
			comment: testExecution.comment,
			executedBy: user.name,
			executedAt: testExecution.executedAt,
			startedAt: testExecution.startedAt,
			completedAt: testExecution.completedAt,
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

	// Duration summary
	const completedExecs = executions.filter((e) => e.startedAt && e.completedAt);
	const durations = completedExecs.map(
		(e) => new Date(e.completedAt!).getTime() - new Date(e.startedAt!).getTime()
	);
	const durationSummary = {
		totalDuration: durations.reduce((sum, d) => sum + d, 0),
		avgDuration:
			durations.length > 0
				? Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length)
				: 0,
		minDuration: durations.length > 0 ? Math.min(...durations) : 0,
		maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
		completedCount: completedExecs.length
	};

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
		durationSummary,
		statusFilter,
		currentUserId: authUser.id
	};
};

export const actions: Actions = {
	updateStatus: async ({ request, locals, params }) => {
		const { authUser, projectId, runId } = await getActionContext(locals, params);

		const guard = await requireEditableRun(projectId, runId);
		if (guard) return guard;
		assertTestRunActionFormBodySize(request);

		const formData = await request.formData();
		const executionId = parsePositiveFormId(formData.get('executionId'));
		const status = parseEnumValue(formData.get('status'), EXECUTION_STATUSES);
		const comment = parseOptionalText(formData.get('comment'), MAX_EXECUTION_COMMENT_LENGTH);

		if (!executionId || !status || comment === null) {
			return fail(400, { error: 'Invalid execution ID or status' });
		}

		const execution = await db.query.testExecution.findFirst({
			where: and(eq(testExecution.id, executionId), eq(testExecution.testRunId, runId))
		});

		if (!execution) {
			return fail(404, { error: 'Execution not found' });
		}

		const now = new Date();
		const durationUpdates: Record<string, Date> = {};
		if (execution.status === 'PENDING') {
			durationUpdates.startedAt = now;
		}
		durationUpdates.completedAt = now;

		await db
			.update(testExecution)
			.set({
				status: status as 'PASS' | 'FAIL' | 'BLOCKED' | 'SKIPPED',
				comment: comment || null,
				executedBy: authUser.id,
				executedAt: now,
				...durationUpdates
			})
			.where(and(eq(testExecution.id, executionId), eq(testExecution.testRunId, runId)));

		await autoUpdateRunStatus(runId);

		const event: RunEvent = {
			type: 'execution:updated',
			executionId,
			status,
			executedBy: authUser.name
		};
		await publishRunEvent(runId, event);

		return { success: true };
	},

	failWithDetail: async ({ request, locals, params }) => {
		const { authUser, projectId, runId } = await getActionContext(locals, params);

		const guard = await requireEditableRun(projectId, runId);
		if (guard) return guard;
		assertTestRunActionFormBodySize(request);

		const formData = await request.formData();
		const executionId = parsePositiveFormId(formData.get('executionId'));

		if (!executionId) {
			return fail(400, { error: 'Missing execution ID' });
		}

		const execution = await db.query.testExecution.findFirst({
			where: and(eq(testExecution.id, executionId), eq(testExecution.testRunId, runId))
		});

		if (!execution) {
			return fail(404, { error: 'Execution not found' });
		}

		const failureData = parseFailureFormData(formData);
		if (!failureData) {
			return fail(400, { error: 'Invalid failure detail data' });
		}

		const parsed = createFailureSchema.safeParse(failureData);
		if (!parsed.success) {
			return fail(400, { error: 'Invalid failure detail data' });
		}

		const createdFailure = await db.transaction(async (tx) => {
			// Set execution to FAIL
			const now = new Date();
			const durationUpdates: Record<string, Date> = {};
			if (execution.status === 'PENDING') {
				durationUpdates.startedAt = now;
			}
			durationUpdates.completedAt = now;

			await tx
				.update(testExecution)
				.set({
					status: 'FAIL',
					executedBy: authUser.id,
					executedAt: now,
					...durationUpdates
				})
				.where(and(eq(testExecution.id, executionId), eq(testExecution.testRunId, runId)));

			// Create failure detail
			const [created] = await tx
				.insert(testFailureDetail)
				.values({
					testExecutionId: executionId,
					failureEnvironment: parsed.data.failureEnvironment || null,
					testMethod: parsed.data.testMethod || null,
					errorMessage: parsed.data.errorMessage || null,
					stackTrace: parsed.data.stackTrace || null,
					comment: parsed.data.comment || null,
					createdBy: authUser.id
				})
				.returning({ id: testFailureDetail.id });
			return created;
		});
		if (!createdFailure) {
			return fail(500, { error: 'Failed to create failure detail' });
		}

		await autoUpdateRunStatus(runId);

		const event: RunEvent = {
			type: 'execution:updated',
			executionId,
			status: 'FAIL',
			executedBy: authUser.name
		};
		await publishRunEvent(runId, event);
		await publishRunEvent(runId, {
			type: 'failure:added',
			executionId
		} satisfies RunEvent);

		return { success: true };
	},

	addFailure: async ({ request, locals, params }) => {
		const { authUser, projectId, runId } = await getActionContext(locals, params);

		const guard = await requireRunInProject(projectId, runId);
		if (guard) return guard;
		assertTestRunActionFormBodySize(request);

		const formData = await request.formData();
		const executionId = parsePositiveFormId(formData.get('executionId'));

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

		const failureData = parseFailureFormData(formData);
		if (!failureData) {
			return fail(400, { error: 'Invalid failure detail data' });
		}

		const parsed = createFailureSchema.safeParse(failureData);
		if (!parsed.success) {
			return fail(400, { error: 'Invalid failure detail data' });
		}

		const [createdFailure] = await db
			.insert(testFailureDetail)
			.values({
				testExecutionId: executionId,
				failureEnvironment: parsed.data.failureEnvironment || null,
				testMethod: parsed.data.testMethod || null,
				errorMessage: parsed.data.errorMessage || null,
				stackTrace: parsed.data.stackTrace || null,
				comment: parsed.data.comment || null,
				createdBy: authUser.id
			})
			.returning({ id: testFailureDetail.id });
		if (!createdFailure) {
			return fail(500, { error: 'Failed to create failure detail' });
		}

		return { success: true };
	},

	updateFailure: async ({ request, locals, params }) => {
		const { projectId, runId } = await getActionContext(locals, params);

		const guard = await requireRunInProject(projectId, runId);
		if (guard) return guard;
		assertTestRunActionFormBodySize(request);

		const formData = await request.formData();
		const failureId = parsePositiveFormId(formData.get('failureId'));

		if (!failureId) {
			return fail(400, { error: 'Missing failure ID' });
		}

		const existing = await db.query.testFailureDetail.findFirst({
			where: eq(testFailureDetail.id, failureId)
		});

		if (!existing) {
			return fail(404, { error: 'Failure detail not found' });
		}

		const execution = await db.query.testExecution.findFirst({
			where: and(eq(testExecution.id, existing.testExecutionId), eq(testExecution.testRunId, runId))
		});

		if (!execution) {
			return fail(404, { error: 'Failure detail not found' });
		}

		const failureData = parseFailureFormData(formData);
		if (!failureData) {
			return fail(400, { error: 'Invalid failure detail data' });
		}

		const parsed = createFailureSchema.safeParse(failureData);
		if (!parsed.success) {
			return fail(400, { error: 'Invalid failure detail data' });
		}

		const [updatedFailure] = await db
			.update(testFailureDetail)
			.set({
				failureEnvironment: parsed.data.failureEnvironment || null,
				testMethod: parsed.data.testMethod || null,
				errorMessage: parsed.data.errorMessage || null,
				stackTrace: parsed.data.stackTrace || null,
				comment: parsed.data.comment || null
			})
			.where(
				and(
					eq(testFailureDetail.id, failureId),
					eq(testFailureDetail.testExecutionId, existing.testExecutionId)
				)
			)
			.returning({ id: testFailureDetail.id });
		if (!updatedFailure) {
			return fail(404, { error: 'Failure detail not found' });
		}

		return { success: true };
	},

	deleteFailure: async ({ request, locals, params }) => {
		const { projectId, runId } = await getActionContext(locals, params);

		const guard = await requireRunInProject(projectId, runId);
		if (guard) return guard;
		assertTestRunActionFormBodySize(request);

		const formData = await request.formData();
		const failureId = parsePositiveFormId(formData.get('failureId'));

		if (!failureId) {
			return fail(400, { error: 'Missing failure ID' });
		}

		const existing = await db.query.testFailureDetail.findFirst({
			where: eq(testFailureDetail.id, failureId)
		});

		if (!existing) {
			return fail(404, { error: 'Failure detail not found' });
		}

		const execution = await db.query.testExecution.findFirst({
			where: and(eq(testExecution.id, existing.testExecutionId), eq(testExecution.testRunId, runId))
		});

		if (!execution) {
			return fail(404, { error: 'Failure detail not found' });
		}

		const [deletedFailure] = await db
			.delete(testFailureDetail)
			.where(
				and(
					eq(testFailureDetail.id, failureId),
					eq(testFailureDetail.testExecutionId, existing.testExecutionId)
				)
			)
			.returning({ id: testFailureDetail.id });
		if (!deletedFailure) {
			return fail(404, { error: 'Failure detail not found' });
		}

		return { success: true };
	},

	bulkPass: async ({ request, locals, params }) => {
		const { authUser, projectId, runId } = await getActionContext(locals, params);

		const guard = await requireEditableRun(projectId, runId);
		if (guard) return guard;
		assertTestRunActionFormBodySize(request);

		const formData = await request.formData();
		const executionIds = formData
			.getAll('executionIds')
			.map(parsePositiveFormId)
			.filter((id): id is number => id !== null);

		if (executionIds.length === 0) {
			return fail(400, { error: 'No executions selected' });
		}

		const now = new Date();
		await db
			.update(testExecution)
			.set({
				status: 'PASS',
				executedBy: authUser.id,
				executedAt: now,
				startedAt: now,
				completedAt: now
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
		await publishRunEvent(runId, event);

		return { success: true };
	},

	updateRunStatus: async ({ request, locals, params }) => {
		const { authUser, projectId, runId } = await getActionContext(locals, params);
		assertTestRunActionFormBodySize(request);

		const formData = await request.formData();
		const status = parseEnumValue(formData.get('status'), RUN_STATUSES);

		if (!status) {
			return fail(400, { error: 'Invalid status' });
		}

		const run = await db.query.testRun.findFirst({
			where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
		});
		if (!run) {
			return fail(404, { error: 'Test run not found' });
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
		await publishRunEvent(runId, event);

		// Notify project members when run is completed
		if (status === 'COMPLETED') {
			const members = await db
				.select({ userId: projectMember.userId })
				.from(projectMember)
				.where(eq(projectMember.projectId, projectId));

			for (const m of members) {
				if (m.userId !== authUser.id) {
					createNotification({
						userId: m.userId,
						type: 'TEST_RUN_COMPLETED',
						title: 'Test run completed',
						message: `"${run?.name ?? 'Test run'}" has been completed`,
						link: `/projects/${projectId}/test-runs/${runId}`,
						projectId
					});
				}
			}
		}

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
