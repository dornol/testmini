import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testSuite, testSuiteItem, testCase, testCaseVersion, user, tag, testCaseTag } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, parent }) => {
	await parent();
	const projectId = Number(params.projectId);
	const suiteId = Number(params.suiteId);

	const suite = await db.query.testSuite.findFirst({
		where: and(eq(testSuite.id, suiteId), eq(testSuite.projectId, projectId))
	});

	if (!suite) {
		error(404, 'Suite not found');
	}

	// Get suite items with test case info
	const items = await db
		.select({
			id: testSuiteItem.id,
			testCaseId: testCase.id,
			key: testCase.key,
			title: testCaseVersion.title,
			priority: testCaseVersion.priority
		})
		.from(testSuiteItem)
		.innerJoin(testCase, eq(testSuiteItem.testCaseId, testCase.id))
		.innerJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
		.where(eq(testSuiteItem.suiteId, suiteId))
		.orderBy(testCase.key);

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

	// Get creator name
	const [creator] = await db
		.select({ name: user.name })
		.from(user)
		.where(eq(user.id, suite.createdBy));

	return {
		suite: { ...suite, createdByName: creator?.name ?? '' },
		items,
		allTestCases
	};
};
