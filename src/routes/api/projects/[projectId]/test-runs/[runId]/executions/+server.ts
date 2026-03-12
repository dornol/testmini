import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCase, testCaseVersion, testExecution, testRun } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';
import { childLogger } from '$lib/server/logger';
import { badRequest, notFound, conflict } from '$lib/server/errors';

const log = childLogger('executions');

export const POST = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ params, request, projectId }) => {
	try {
		const runId = Number(params.runId);

		const body = await parseJsonBody(request);
		const { testCaseId } = body as { testCaseId: number };

		if (!testCaseId || isNaN(testCaseId)) {
			return badRequest('testCaseId is required');
		}

		// Verify run belongs to project
		const run = await db.query.testRun.findFirst({
			where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
		});

		if (!run) {
			return notFound('Test run not found');
		}

		if (run.status === 'COMPLETED') {
			return json({ error: 'Cannot modify executions in a completed run' }, { status: 403 });
		}

		// Verify test case belongs to project and get latest version
		const tc = await db.query.testCase.findFirst({
			where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
		});

		if (!tc || !tc.latestVersionId) {
			return notFound('Test case not found');
		}

		// Check if execution already exists for this test case in this run
		const existing = await db
			.select({ id: testExecution.id })
			.from(testExecution)
			.innerJoin(testCaseVersion, eq(testExecution.testCaseVersionId, testCaseVersion.id))
			.where(
				and(
					eq(testExecution.testRunId, runId),
					eq(testCaseVersion.testCaseId, testCaseId)
				)
			);

		if (existing.length > 0) {
			return conflict('Execution already exists for this test case');
		}

		const [execution] = await db
			.insert(testExecution)
			.values({
				testRunId: runId,
				testCaseVersionId: tc.latestVersionId
			})
			.returning();

		return json({ executionId: execution.id, status: 'PENDING' });
	} catch (err: unknown) {
		log.error({ err }, 'POST executions failed');
		// Re-throw SvelteKit HttpError (from requireAuth/requireProjectRole)
		if (err && typeof err === 'object' && 'status' in err) {
			const httpErr = err as { status: number; body?: { message?: string } };
			return json(
				{ error: httpErr.body?.message || 'Request failed' },
				{ status: httpErr.status }
			);
		}
		return json({ error: String(err) }, { status: 500 });
	}
});
