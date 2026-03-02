import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { testRun, testExecution, testCaseVersion, testCase } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, requireProjectRole } from '$lib/server/auth-utils';

export const POST: RequestHandler = async ({ request, locals, params }) => {
	const user = requireAuth(locals);
	const projectId = Number(params.projectId);
	const runId = Number(params.runId);
	await requireProjectRole(user, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

	const originalRun = await db.query.testRun.findFirst({
		where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
	});

	if (!originalRun) {
		error(404, 'Test run not found');
	}

	const body = await request.json().catch(() => ({}));
	const name = (body as { name?: string }).name || `Copy of ${originalRun.name}`;

	// Get all executions from the original run, extract testCaseId for each
	const executions = await db
		.select({
			testCaseId: testCase.id,
			latestVersionId: testCase.latestVersionId
		})
		.from(testExecution)
		.innerJoin(testCaseVersion, eq(testExecution.testCaseVersionId, testCaseVersion.id))
		.innerJoin(testCase, eq(testCaseVersion.testCaseId, testCase.id))
		.where(eq(testExecution.testRunId, runId));

	const newRun = await db.transaction(async (tx) => {
		const [created] = await tx
			.insert(testRun)
			.values({
				projectId,
				name,
				environment: originalRun.environment,
				createdBy: user.id
			})
			.returning();

		if (executions.length > 0) {
			const executionValues = executions
				.filter((e) => e.latestVersionId !== null)
				.map((e) => ({
					testRunId: created.id,
					testCaseVersionId: e.latestVersionId!
				}));

			if (executionValues.length > 0) {
				await tx.insert(testExecution).values(executionValues);
			}
		}

		return created;
	});

	return json({ id: newRun.id });
};
