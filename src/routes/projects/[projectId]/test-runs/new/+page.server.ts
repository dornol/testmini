import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCase, testCaseVersion, testRun, testExecution } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, requireProjectRole } from '$lib/server/auth-utils';
import { createTestRunSchema, type CreateTestRunInput } from '$lib/schemas/test-run.schema';

export const load: PageServerLoad = async ({ params, parent }) => {
	const { userRole } = await parent();
	if (userRole === 'VIEWER') {
		redirect(303, '../test-runs');
	}

	const projectId = Number(params.projectId);

	// Get all test cases with latest version for selection
	const testCases = await db
		.select({
			id: testCase.id,
			key: testCase.key,
			title: testCaseVersion.title,
			priority: testCaseVersion.priority
		})
		.from(testCase)
		.innerJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
		.where(eq(testCase.projectId, projectId))
		.orderBy(testCase.id);

	return { testCases };
};

export const actions: Actions = {
	default: async ({ request, locals, params }) => {
		const user = requireAuth(locals);
		const projectId = Number(params.projectId);
		await requireProjectRole(user, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

		const formData = await request.formData();
		const name = formData.get('name') as string;
		const environment = formData.get('environment') as string;
		const testCaseIdsRaw = formData.getAll('testCaseIds');
		const testCaseIds = testCaseIdsRaw.map((id) => Number(id)).filter((id) => !isNaN(id));

		const parsed = createTestRunSchema.safeParse({ name, environment, testCaseIds });
		if (!parsed.success) {
			const errors = parsed.error.flatten().fieldErrors;
			return fail(400, { name, environment, testCaseIds, errors });
		}

		const input = parsed.data as CreateTestRunInput;

		// Get latest version IDs for selected test cases
		const selectedCases = await db
			.select({
				id: testCase.id,
				latestVersionId: testCase.latestVersionId
			})
			.from(testCase)
			.where(eq(testCase.projectId, projectId));

		const caseMap = new Map(selectedCases.map((c) => [c.id, c.latestVersionId]));

		const newRun = await db.transaction(async (tx) => {
			const [run] = await tx
				.insert(testRun)
				.values({
					projectId,
					name: input.name,
					environment: input.environment,
					createdBy: user.id
				})
				.returning();

			const executionValues = input.testCaseIds
				.map((tcId) => {
					const versionId = caseMap.get(tcId);
					if (!versionId) return null;
					return {
						testRunId: run.id,
						testCaseVersionId: versionId
					};
				})
				.filter(Boolean) as { testRunId: number; testCaseVersionId: number }[];

			if (executionValues.length > 0) {
				await tx.insert(testExecution).values(executionValues);
			}

			return run;
		});

		redirect(303, `/projects/${projectId}/test-runs/${newRun.id}`);
	}
};
