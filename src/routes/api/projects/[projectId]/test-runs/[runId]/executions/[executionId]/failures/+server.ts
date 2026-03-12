import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testFailureDetail, testExecution, testRun } from '$lib/server/db/schema';
import { user } from '$lib/server/db/auth.schema';
import { eq, and } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';
import { createFailureSchema } from '$lib/schemas/failure.schema';
import { badRequest } from '$lib/server/errors';

export const GET = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV', 'VIEWER'], async ({ params, projectId }) => {
	const runId = Number(params.runId);
	const executionId = Number(params.executionId);

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
});

export const POST = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ params, request, user, projectId }) => {
	const runId = Number(params.runId);
	const executionId = Number(params.executionId);

	const run = await db.query.testRun.findFirst({
		where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
	});

	if (!run) {
		error(404, 'Test run not found');
	}

	if (run.status === 'COMPLETED') {
		error(403, 'Cannot modify executions in a completed run');
	}

	const execution = await db.query.testExecution.findFirst({
		where: and(eq(testExecution.id, executionId), eq(testExecution.testRunId, runId))
	});

	if (!execution) {
		error(404, 'Execution not found');
	}

	const body = await parseJsonBody(request);
	const parsed = createFailureSchema.safeParse(body);
	if (!parsed.success) {
		return badRequest('Invalid failure detail data');
	}

	await db.transaction(async (tx) => {
		await tx
			.update(testExecution)
			.set({
				status: 'FAIL',
				executedBy: user.id,
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
			createdBy: user.id
		});
	});

	return json({ success: true });
});
