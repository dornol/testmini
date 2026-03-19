import { json } from '@sveltejs/kit';
import { badRequest } from '$lib/server/errors';
import { db } from '$lib/server/db';
import {
	requirement,
	requirementTestCase
} from '$lib/server/db/schema';
import { eq, sql, desc, inArray } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { loadLatestTestCaseExecutionMap } from '$lib/server/queries';

export const GET = withProjectAccess(async ({ projectId }) => {
	// Get all requirements with test case count
	const reqs = await db
		.select({
			id: requirement.id,
			externalId: requirement.externalId,
			title: requirement.title,
			description: requirement.description,
			source: requirement.source,
			createdAt: requirement.createdAt,
			testCaseCount: sql<number>`(
				SELECT count(*) FROM requirement_test_case
				WHERE requirement_id = ${requirement.id}
			)`.as('test_case_count')
		})
		.from(requirement)
		.where(eq(requirement.projectId, projectId))
		.orderBy(desc(requirement.createdAt));

	if (reqs.length === 0) return json([]);

	const reqIds = reqs.map((r) => r.id);

	// Batch: get all linked test case IDs
	const allLinks = await db
		.select({
			requirementId: requirementTestCase.requirementId,
			testCaseId: requirementTestCase.testCaseId
		})
		.from(requirementTestCase)
		.where(inArray(requirementTestCase.requirementId, reqIds));

	// Batch: get latest execution status per test case
	const allTestCaseIds = [...new Set(allLinks.map((l) => l.testCaseId))];
	const latestExecMap = await loadLatestTestCaseExecutionMap(projectId, allTestCaseIds);

	// Build per-requirement link map
	const linksByReq = new Map<number, number[]>();
	for (const link of allLinks) {
		const arr = linksByReq.get(link.requirementId) ?? [];
		arr.push(link.testCaseId);
		linksByReq.set(link.requirementId, arr);
	}

	// Assemble result
	const result = reqs.map((req) => {
		const coverage = { pass: 0, fail: 0, pending: 0, blocked: 0, skipped: 0, notExecuted: 0 };
		const tcIds = linksByReq.get(req.id) ?? [];

		for (const tcId of tcIds) {
			const status = latestExecMap.get(tcId);
			if (!status) {
				coverage.notExecuted++;
			} else if (status === 'PASS') coverage.pass++;
			else if (status === 'FAIL') coverage.fail++;
			else if (status === 'PENDING') coverage.pending++;
			else if (status === 'BLOCKED') coverage.blocked++;
			else if (status === 'SKIPPED') coverage.skipped++;
		}

		return {
			id: req.id,
			externalId: req.externalId,
			title: req.title,
			description: req.description,
			source: req.source,
			testCaseCount: Number(req.testCaseCount),
			coverage,
			createdAt: req.createdAt
		};
	});

	return json(result);
});

export const POST = withProjectRole(['PROJECT_ADMIN', 'QA'], async ({ request, user, projectId }) => {
	const body = (await parseJsonBody(request)) as {
		title?: string;
		externalId?: string;
		description?: string;
		source?: string;
	};

	if (!body.title?.trim()) {
		return badRequest('Title is required');
	}

	const [created] = await db
		.insert(requirement)
		.values({
			projectId,
			title: body.title.trim(),
			externalId: body.externalId?.trim() || null,
			description: body.description?.trim() || null,
			source: body.source?.trim() || null,
			createdBy: user.id
		})
		.returning();

	return json(created, { status: 201 });
});
