import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testPlan, testPlanTestCase, testCase, testCaseVersion, testRun, user } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, parent }) => {
	await parent();
	const projectId = Number(params.projectId);
	const planId = Number(params.planId);

	const plan = await db.query.testPlan.findFirst({
		where: and(eq(testPlan.id, planId), eq(testPlan.projectId, projectId))
	});

	if (!plan) {
		error(404, 'Plan not found');
	}

	// Get creator name
	const [creator] = await db
		.select({ name: user.name })
		.from(user)
		.where(eq(user.id, plan.createdBy));

	// Get items with test case info
	const items = await db
		.select({
			id: testPlanTestCase.id,
			testCaseId: testCase.id,
			key: testCase.key,
			title: testCaseVersion.title,
			priority: testCaseVersion.priority,
			position: testPlanTestCase.position
		})
		.from(testPlanTestCase)
		.innerJoin(testCase, eq(testPlanTestCase.testCaseId, testCase.id))
		.innerJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
		.where(eq(testPlanTestCase.testPlanId, planId))
		.orderBy(testPlanTestCase.position);

	// Get linked runs
	const runs = await db
		.select({
			id: testRun.id,
			name: testRun.name,
			status: testRun.status,
			environment: testRun.environment,
			createdAt: testRun.createdAt
		})
		.from(testRun)
		.where(eq(testRun.testPlanId, planId))
		.orderBy(testRun.createdAt);

	// Get all test cases for "Add Cases" dialog
	const allTestCases = await db
		.select({
			id: testCase.id,
			key: testCase.key,
			title: testCaseVersion.title,
			priority: testCaseVersion.priority
		})
		.from(testCase)
		.innerJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
		.where(eq(testCase.projectId, projectId))
		.orderBy(testCase.key);

	return {
		plan: { ...plan, createdByName: creator?.name ?? '' },
		items,
		runs,
		allTestCases
	};
};
