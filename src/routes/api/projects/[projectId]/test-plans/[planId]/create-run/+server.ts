import { json, error } from '@sveltejs/kit';
import { validationError } from '$lib/server/errors';
import { db } from '$lib/server/db';
import {
	testPlan, testPlanTestCase, testCase, testCaseDataSet,
	testRun, testExecution
} from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';
import { z } from 'zod';

const createRunFromPlanSchema = z.object({
	name: z.string().min(1).max(200),
	environment: z.string().min(1).max(100)
});

export const POST = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ request, params, projectId, user: authUser }) => {
	const planId = Number(params.planId);

	const plan = await db.query.testPlan.findFirst({
		where: and(eq(testPlan.id, planId), eq(testPlan.projectId, projectId))
	});

	if (!plan) {
		error(404, 'Plan not found');
	}

	const body = await parseJsonBody(request);
	const parsed = createRunFromPlanSchema.safeParse(body);
	if (!parsed.success) {
		return validationError('Invalid input', parsed.error.flatten().fieldErrors);
	}

	// Get all plan items
	const planItems = await db
		.select({
			testCaseId: testPlanTestCase.testCaseId
		})
		.from(testPlanTestCase)
		.where(eq(testPlanTestCase.testPlanId, planId))
		.orderBy(testPlanTestCase.position);

	const testCaseIds = planItems.map((i) => i.testCaseId);

	if (testCaseIds.length === 0) {
		error(400, 'Plan has no test cases');
	}

	// Get latest version IDs for selected test cases
	const selectedCases = await db
		.select({
			id: testCase.id,
			latestVersionId: testCase.latestVersionId
		})
		.from(testCase)
		.where(eq(testCase.projectId, projectId));

	const caseMap = new Map(selectedCases.map((c) => [c.id, c.latestVersionId]));

	// Load data sets for parameterized expansion
	const dataSetsByTcId = new Map<number, typeof dsRows>();
	const dsRows = await db
		.select()
		.from(testCaseDataSet)
		.orderBy(testCaseDataSet.orderIndex);
	for (const row of dsRows) {
		if (!testCaseIds.includes(row.testCaseId)) continue;
		if (!dataSetsByTcId.has(row.testCaseId)) {
			dataSetsByTcId.set(row.testCaseId, []);
		}
		dataSetsByTcId.get(row.testCaseId)!.push(row);
	}

	const newRun = await db.transaction(async (tx) => {
		const [run] = await tx
			.insert(testRun)
			.values({
				projectId,
				name: parsed.data.name,
				environment: parsed.data.environment,
				createdBy: authUser.id,
				testPlanId: planId
			})
			.returning();

		const executionValues: {
			testRunId: number;
			testCaseVersionId: number;
			dataSetId?: number | null;
			parameterValues?: Record<string, string> | null;
		}[] = [];

		for (const tcId of testCaseIds) {
			const versionId = caseMap.get(tcId);
			if (!versionId) continue;

			const dataSets = dataSetsByTcId.get(tcId);
			if (dataSets && dataSets.length > 0) {
				for (const ds of dataSets) {
					executionValues.push({
						testRunId: run.id,
						testCaseVersionId: versionId,
						dataSetId: ds.id,
						parameterValues: ds.values as Record<string, string>
					});
				}
			} else {
				executionValues.push({
					testRunId: run.id,
					testCaseVersionId: versionId
				});
			}
		}

		if (executionValues.length > 0) {
			await tx.insert(testExecution).values(executionValues);
		}

		return run;
	});

	return json({ runId: newRun.id }, { status: 201 });
});
