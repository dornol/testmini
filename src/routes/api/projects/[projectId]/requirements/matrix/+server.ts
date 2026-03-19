import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	requirement,
	requirementTestCase,
	testCase,
	testCaseVersion,
} from '$lib/server/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { withProjectAccess } from '$lib/server/api-handler';
import { loadLatestTestCaseExecutionMap } from '$lib/server/queries';

export const GET = withProjectAccess(async ({ projectId }) => {
	const reqs = await db
		.select({
			id: requirement.id,
			externalId: requirement.externalId,
			title: requirement.title,
			source: requirement.source
		})
		.from(requirement)
		.where(eq(requirement.projectId, projectId))
		.orderBy(requirement.id);

	if (reqs.length === 0) return json({ requirements: [] });

	const reqIds = reqs.map((r) => r.id);

	// Batch: get all linked test cases with their details
	const allLinks = await db
		.select({
			requirementId: requirementTestCase.requirementId,
			testCaseId: requirementTestCase.testCaseId,
			key: testCase.key,
			title: testCaseVersion.title
		})
		.from(requirementTestCase)
		.innerJoin(testCase, eq(requirementTestCase.testCaseId, testCase.id))
		.innerJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
		.where(inArray(requirementTestCase.requirementId, reqIds))
		.orderBy(testCase.key);

	// Batch: get latest execution status per test case
	const allTestCaseIds = [...new Set(allLinks.map((l) => l.testCaseId))];
	const latestExecMap = await loadLatestTestCaseExecutionMap(projectId, allTestCaseIds);

	// Group links by requirement
	const linksByReq = new Map<number, typeof allLinks>();
	for (const link of allLinks) {
		const arr = linksByReq.get(link.requirementId) ?? [];
		arr.push(link);
		linksByReq.set(link.requirementId, arr);
	}

	const result = reqs.map((req) => {
		const links = linksByReq.get(req.id) ?? [];
		const testCases = links.map((link) => ({
			id: link.testCaseId,
			key: link.key,
			title: link.title,
			latestStatus: latestExecMap.get(link.testCaseId) ?? null
		}));

		return {
			id: req.id,
			externalId: req.externalId,
			title: req.title,
			source: req.source,
			testCases
		};
	});

	return json({ requirements: result });
});
