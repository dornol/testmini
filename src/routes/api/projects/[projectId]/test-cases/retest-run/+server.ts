import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCase, testRun, testExecution } from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';
import { badRequest } from '$lib/server/errors';

export const POST = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ request, projectId, user: currentUser }) => {
		const body = await parseJsonBody(request) as Record<string, unknown>;
		const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Retest Run';
		const environment = typeof body.environment === 'string' && body.environment.trim() ? body.environment.trim() : 'QA';

		// Get test cases needing retest
		let cases;
		if (Array.isArray(body.testCaseIds) && body.testCaseIds.length > 0) {
			cases = await db
				.select({ id: testCase.id, latestVersionId: testCase.latestVersionId })
				.from(testCase)
				.where(
					and(
						eq(testCase.projectId, projectId),
						eq(testCase.retestNeeded, true),
						inArray(testCase.id, body.testCaseIds as number[])
					)
				);
		} else {
			cases = await db
				.select({ id: testCase.id, latestVersionId: testCase.latestVersionId })
				.from(testCase)
				.where(and(eq(testCase.projectId, projectId), eq(testCase.retestNeeded, true)));
		}

		const validCases = cases.filter((c) => c.latestVersionId != null);
		if (validCases.length === 0) {
			return badRequest('No test cases need retesting');
		}

		const result = await db.transaction(async (tx) => {
			const [run] = await tx
				.insert(testRun)
				.values({
					projectId,
					name,
					environment,
					createdBy: currentUser.id
				})
				.returning();

			await tx.insert(testExecution).values(
				validCases.map((c) => ({
					testRunId: run.id,
					testCaseVersionId: c.latestVersionId!
				}))
			);

			// Clear retest flag on included cases
			await tx
				.update(testCase)
				.set({ retestNeeded: false })
				.where(
					inArray(
						testCase.id,
						validCases.map((c) => c.id)
					)
				);

			return run;
		});

		return json({ runId: result.id, executionCount: validCases.length }, { status: 201 });
	}
);
