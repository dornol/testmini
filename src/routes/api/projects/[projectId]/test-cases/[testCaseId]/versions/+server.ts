import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { testCase, testCaseVersion, user } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, requireProjectAccess } from '$lib/server/auth-utils';

export const GET: RequestHandler = async ({ params, locals, url }) => {
	const authUser = requireAuth(locals);
	const projectId = Number(params.projectId);
	const testCaseId = Number(params.testCaseId);
	await requireProjectAccess(authUser, projectId);

	const v1 = Number(url.searchParams.get('v1'));
	const v2 = Number(url.searchParams.get('v2'));

	if (isNaN(v1) || isNaN(v2) || v1 === v2) {
		error(400, 'Provide two different version numbers v1 and v2');
	}

	// Verify test case belongs to project
	const tc = await db.query.testCase.findFirst({
		where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
	});
	if (!tc) error(404, 'Test case not found');

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
};
