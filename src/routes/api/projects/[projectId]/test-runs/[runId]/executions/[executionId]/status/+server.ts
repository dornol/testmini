import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	testExecution,
	testRun,
	testCaseVersion,
	testCase,
	testCaseAssignee
} from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { parseJsonBody, parseId } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';
import { requireEditableRun } from '$lib/server/crud-helpers';
import { publish } from '$lib/server/redis';
import { createNotification } from '$lib/server/notifications';
import type { RunEvent } from '$lib/types/events';
import { validateRequestBody } from '$lib/server/id-list-validation';

const EXECUTION_STATUSES = ['PASS', 'FAIL', 'BLOCKED', 'SKIPPED', 'PENDING'] as const;
type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

export const PUT = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ params, request, user, projectId }) => {
		const runId = parseId(params.runId, 'run ID');
		const executionId = parseId(params.executionId, 'execution ID');

		const bodyOrError = validateRequestBody(await parseJsonBody(request));
		if (bodyOrError instanceof Response) return bodyOrError;
		const status = bodyOrError.status;

		if (typeof status !== 'string' || !EXECUTION_STATUSES.includes(status as ExecutionStatus)) {
			error(400, 'Invalid status');
		}
		const executionStatus = status as ExecutionStatus;

		const run = await requireEditableRun(runId, projectId);

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
				status: executionStatus,
				executedBy: user.id,
				executedAt: new Date()
			})
			.where(and(eq(testExecution.id, executionId), eq(testExecution.testRunId, runId)));

		// Auto-update run status
		await autoUpdateRunStatus(runId);

		// Notify assignees on FAIL
		if (executionStatus === 'FAIL') {
			const version = await db.query.testCaseVersion.findFirst({
				where: eq(testCaseVersion.id, execution.testCaseVersionId)
			});
			if (version) {
				const tc = await db.query.testCase.findFirst({
					where: eq(testCase.id, version.testCaseId)
				});
				if (tc) {
					const assignees = await db
						.select({ userId: testCaseAssignee.userId })
						.from(testCaseAssignee)
						.where(eq(testCaseAssignee.testCaseId, tc.id));

					for (const a of assignees) {
						if (a.userId !== user.id) {
							createNotification({
								userId: a.userId,
								type: 'TEST_FAILED',
								title: 'Test case failed',
								message: `${tc.key} failed in "${run.name}"`,
								link: `/projects/${projectId}/test-runs/${runId}`,
								projectId
							});
						}
					}
				}
			}
		}

		const event: RunEvent = {
			type: 'execution:updated',
			executionId,
			status: executionStatus,
			executedBy: user.name
		};
		await publish(`run:${runId}:events`, event);

		return json({ success: true, status: executionStatus });
	}
);

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
