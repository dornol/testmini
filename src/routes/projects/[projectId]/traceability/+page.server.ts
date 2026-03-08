import type { PageServerLoad } from './$types';
import { requireAuth, requireProjectAccess } from '$lib/server/auth-utils';
import { db } from '$lib/server/db';
import { testCase, testCaseVersion } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	await parent();
	const authUser = requireAuth(locals);
	const projectId = Number(params.projectId);
	await requireProjectAccess(authUser, projectId);

	// Load all test cases for the "Link Test Case" dialog
	const allTestCases = await db
		.select({
			id: testCase.id,
			key: testCase.key,
			title: testCaseVersion.title
		})
		.from(testCase)
		.innerJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
		.where(eq(testCase.projectId, projectId))
		.orderBy(testCase.key);

	return { projectId, allTestCases };
};
