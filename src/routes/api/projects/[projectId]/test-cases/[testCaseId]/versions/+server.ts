import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCaseVersion, user } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { parseId } from '$lib/server/auth-utils';
import { withProjectAccess } from '$lib/server/api-handler';
import { requireTestCase } from '$lib/server/queries';

export const GET = withProjectAccess(async ({ params, url, projectId }) => {
	const testCaseId = parseId(params.testCaseId, 'test case ID');

	const v1 = Number(url.searchParams.get('v1'));
	const v2 = Number(url.searchParams.get('v2'));

	if (isNaN(v1) || isNaN(v2) || v1 === v2) {
		error(400, 'Provide two different version numbers v1 and v2');
	}

	await requireTestCase(testCaseId, projectId);

	const [ver1Row] = await db
		.select({
			id: testCaseVersion.id,
			versionNo: testCaseVersion.versionNo,
			title: testCaseVersion.title,
			precondition: testCaseVersion.precondition,
			steps: testCaseVersion.steps,
			expectedResult: testCaseVersion.expectedResult,
			priority: testCaseVersion.priority,
			updatedBy: user.name,
			createdAt: testCaseVersion.createdAt
		})
		.from(testCaseVersion)
		.leftJoin(user, eq(testCaseVersion.updatedBy, user.id))
		.where(
			and(eq(testCaseVersion.testCaseId, testCaseId), eq(testCaseVersion.versionNo, v1))
		);

	const [ver2Row] = await db
		.select({
			id: testCaseVersion.id,
			versionNo: testCaseVersion.versionNo,
			title: testCaseVersion.title,
			precondition: testCaseVersion.precondition,
			steps: testCaseVersion.steps,
			expectedResult: testCaseVersion.expectedResult,
			priority: testCaseVersion.priority,
			updatedBy: user.name,
			createdAt: testCaseVersion.createdAt
		})
		.from(testCaseVersion)
		.leftJoin(user, eq(testCaseVersion.updatedBy, user.id))
		.where(
			and(eq(testCaseVersion.testCaseId, testCaseId), eq(testCaseVersion.versionNo, v2))
		);

	if (!ver1Row || !ver2Row) {
		error(404, 'One or both versions not found');
	}

	return json({ v1: ver1Row, v2: ver2Row });
});
