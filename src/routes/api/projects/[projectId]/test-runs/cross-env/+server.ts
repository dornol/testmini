import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testRun, testExecution, testCase } from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { parseJsonObjectBody } from '$lib/server/auth-utils';
import { createCrossEnvRunSchema } from '$lib/schemas/cross-env-run.schema';
import { validationError, badRequest } from '$lib/server/errors';
import {
	validateOptionalReleaseId,
	validateOptionalTestCycleId,
	validateOptionalTestPlanId
} from '$lib/server/project-reference-validation';

/** Create multiple test runs — one per environment — with the same test cases */
export const POST = withProjectRole(
	['PROJECT_ADMIN', 'QA'],
	async ({ request, projectId, user: currentUser }) => {
		const body = await parseJsonObjectBody(request);
		const parsed = createCrossEnvRunSchema.safeParse(body);
		if (!parsed.success) {
			return validationError('Invalid input', parsed.error.flatten().fieldErrors);
		}

		const { name, testCaseIds, environments, testPlanId, releaseId, testCycleId } = parsed.data;

		const planError = await validateOptionalTestPlanId(testPlanId, projectId);
		if (planError) return planError;
		const releaseError = await validateOptionalReleaseId(releaseId, projectId);
		if (releaseError) return releaseError;
		const cycleError = await validateOptionalTestCycleId(testCycleId, projectId);
		if (cycleError) return cycleError;

		// Verify test cases belong to project and get latest version IDs
		const testCases = await db
			.select({ id: testCase.id, latestVersionId: testCase.latestVersionId })
			.from(testCase)
			.where(and(eq(testCase.projectId, projectId), inArray(testCase.id, testCaseIds)));

		if (testCases.length === 0) return badRequest('No valid test cases found');

		const validTCs = testCases.filter((tc) => tc.latestVersionId !== null);
		if (validTCs.length === 0) return badRequest('No test cases with versions found');

		const createdRuns: { id: number; environment: string }[] = [];

		await db.transaction(async (tx) => {
			for (const env of environments) {
				const [run] = await tx
					.insert(testRun)
					.values({
						projectId,
						name: `${name} [${env}]`,
						environment: env,
						createdBy: currentUser.id,
						testPlanId: testPlanId ?? null,
						releaseId: releaseId ?? null,
						testCycleId: testCycleId ?? null
					})
					.returning({ id: testRun.id });
				if (!run) {
					error(500, 'Failed to create test run');
				}

				const execValues = validTCs.map((tc) => ({
					testRunId: run.id,
					testCaseVersionId: tc.latestVersionId!
				}));

				const insertedExecutions = await tx
					.insert(testExecution)
					.values(execValues)
					.returning({ id: testExecution.id });
				if (insertedExecutions.length !== execValues.length) {
					error(500, 'Failed to create all test run executions');
				}

				createdRuns.push({ id: run.id, environment: env });
			}
		});

		return json({ runs: createdRuns }, { status: 201 });
	}
);
