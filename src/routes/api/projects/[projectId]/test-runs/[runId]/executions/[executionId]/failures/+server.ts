import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { testFailureDetail, testExecution, testRun } from '$lib/server/db/schema';
import { user } from '$lib/server/db/auth.schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, requireProjectRole } from '$lib/server/auth-utils';
import { createFailureSchema } from '$lib/schemas/failure.schema';

export const GET: RequestHandler = async ({ locals, params }) => {
	const authUser = requireAuth(locals);
	const projectId = Number(params.projectId);
	const runId = Number(params.runId);
	const executionId = Number(params.executionId);

	if (isNaN(projectId) || isNaN(runId) || isNaN(executionId)) {
		error(400, 'Invalid parameters');
	}

	await requireProjectRole(authUser, projectId, [
		'PROJECT_ADMIN',
		'QA',
		'DEV',
		'VIEWER'
	]);

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

	const failures = await db
		.select({
			id: testFailureDetail.id,
			errorMessage: testFailureDetail.errorMessage,
			testMethod: testFailureDetail.testMethod,
			failureEnvironment: testFailureDetail.failureEnvironment,
			stackTrace: testFailureDetail.stackTrace,
			comment: testFailureDetail.comment,
			createdBy: testFailureDetail.createdBy,
			createdAt: testFailureDetail.createdAt,
			createdByName: user.name
		})
		.from(testFailureDetail)
		.leftJoin(user, eq(testFailureDetail.createdBy, user.id))
		.where(eq(testFailureDetail.testExecutionId, executionId))
		.orderBy(testFailureDetail.createdAt);

	return json({ failures });
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const authUser = requireAuth(locals);
	const projectId = Number(params.projectId);
	const runId = Number(params.runId);
	const executionId = Number(params.executionId);

	if (isNaN(projectId) || isNaN(runId) || isNaN(executionId)) {
		error(400, 'Invalid parameters');
	}

	await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

	const run = await db.query.testRun.findFirst({
		where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
	});

	if (!run) {
		error(404, 'Test run not found');
	}

	const execution = await db.query.testExecution.findFirst({
		where: and(eq(testExecution.id, executionId), eq(testExecution.testRunId, runId))
	});

	if (!execution) {
		error(404, 'Execution not found');
	}

	const body = await request.json();
	const parsed = createFailureSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: 'Invalid failure detail data' }, { status: 400 });
	}

	await db.transaction(async (tx) => {
		await tx
			.update(testExecution)
			.set({
				status: 'FAIL',
				executedBy: authUser.id,
				executedAt: new Date()
			})
			.where(eq(testExecution.id, executionId));

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

	return json({ success: true });
};
