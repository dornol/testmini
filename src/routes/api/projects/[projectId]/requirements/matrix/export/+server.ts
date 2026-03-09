import { db } from '$lib/server/db';
import {
	requirement,
	requirementTestCase,
	testCase,
	testCaseVersion,
} from '$lib/server/db/schema';
import { eq, sql, inArray } from 'drizzle-orm';
import { csvResponse } from '$lib/server/csv-utils';
import { withProjectAccess } from '$lib/server/api-handler';

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

	const headers = [
		'Requirement ID',
		'External ID',
		'Title',
		'Source',
		'Test Case Key',
		'Test Case Title',
		'Latest Status'
	];

	if (reqs.length === 0) return csvResponse(headers, [], 'traceability_matrix.csv');

	const reqIds = reqs.map((r) => r.id);

	// Batch: get all linked test cases
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

	const latestExecMap = new Map<number, string>();
	if (allTestCaseIds.length > 0) {
		const latestExecs = await db.execute(sql`
			SELECT DISTINCT ON (tcv.test_case_id)
				tcv.test_case_id, te.status
			FROM test_execution te
			JOIN test_case_version tcv ON te.test_case_version_id = tcv.id
			JOIN test_run tr ON te.test_run_id = tr.id
			WHERE tr.project_id = ${projectId}
				AND tcv.test_case_id IN ${sql`(${sql.join(allTestCaseIds.map(id => sql`${id}`), sql`, `)})`}
			ORDER BY tcv.test_case_id, te.id DESC
		`);
		for (const row of latestExecs as unknown as { test_case_id: number; status: string }[]) {
			latestExecMap.set(row.test_case_id, row.status);
		}
	}

	// Group links by requirement
	const linksByReq = new Map<number, typeof allLinks>();
	for (const link of allLinks) {
		const arr = linksByReq.get(link.requirementId) ?? [];
		arr.push(link);
		linksByReq.set(link.requirementId, arr);
	}

	const rows: (string | null | undefined)[][] = [];

	for (const req of reqs) {
		const links = linksByReq.get(req.id) ?? [];

		if (links.length === 0) {
			rows.push([
				String(req.id),
				req.externalId,
				req.title,
				req.source,
				'',
				'',
				'NO COVERAGE'
			]);
		} else {
			for (const link of links) {
				rows.push([
					String(req.id),
					req.externalId,
					req.title,
					req.source,
					link.key,
					link.title,
					latestExecMap.get(link.testCaseId) ?? 'NOT EXECUTED'
				]);
			}
		}
	}

	return csvResponse(headers, rows, 'traceability_matrix.csv');
});
