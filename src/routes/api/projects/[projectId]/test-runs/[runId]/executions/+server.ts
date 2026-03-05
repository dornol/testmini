import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { testCase, testCaseVersion, testExecution, testRun } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, requireProjectRole, parseJsonBody } from '$lib/server/auth-utils';
import { childLogger } from '$lib/server/logger';

const log = childLogger('executions');

export const POST: RequestHandler = async ({ params, request, locals }) => {
	try {
		const user = requireAuth(locals);
		const projectId = Number(params.projectId);
		const runId = Number(params.runId);

		if (isNaN(projectId) || isNaN(runId)) {
			return json({ error: 'Invalid parameters' }, { status: 400 });
		}

		await requireProjectRole(user, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

		const body = await parseJsonBody(request);
		const { testCaseId } = body as { testCaseId: number };

		if (!testCaseId || isNaN(testCaseId)) {
			return json({ error: 'testCaseId is required' }, { status: 400 });
		}

		// Verify run belongs to project
		const run = await db.query.testRun.findFirst({
			where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
		});

		if (!run) {
			return json({ error: 'Test run not found' }, { status: 404 });
		}

		// Verify test case belongs to project and get latest version
		const tc = await db.query.testCase.findFirst({
			where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
		});

		if (!tc || !tc.latestVersionId) {
			return json({ error: 'Test case not found' }, { status: 404 });
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
			return json({ error: 'Execution already exists for this test case' }, { status: 409 });
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
};
