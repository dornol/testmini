import { json } from '@sveltejs/kit';
import { badRequest } from '$lib/server/errors';
import { db } from '$lib/server/db';
import {
	requirement,
	requirementTestCase,
	testCase,
	testCaseVersion,
	testExecution,
	testRun
} from '$lib/server/db/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';

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

	// For each requirement, compute coverage from linked test cases' latest execution
	const result = await Promise.all(
		reqs.map(async (req) => {
			// Get linked test case IDs
			const links = await db
				.select({ testCaseId: requirementTestCase.testCaseId })
				.from(requirementTestCase)
				.where(eq(requirementTestCase.requirementId, req.id));

			const coverage = { pass: 0, fail: 0, pending: 0, blocked: 0, skipped: 0, notExecuted: 0 };

			for (const link of links) {
				// Get latest execution status for this test case
				const latestExec = await db
					.select({ status: testExecution.status })
					.from(testExecution)
					.innerJoin(testCaseVersion, eq(testExecution.testCaseVersionId, testCaseVersion.id))
					.innerJoin(testRun, eq(testExecution.testRunId, testRun.id))
					.where(
						and(
							eq(testCaseVersion.testCaseId, link.testCaseId),
							eq(testRun.projectId, projectId)
						)
					)
					.orderBy(desc(testExecution.id))
					.limit(1);

				if (latestExec.length === 0) {
					coverage.notExecuted++;
				} else {
					const status = latestExec[0].status;
					if (status === 'PASS') coverage.pass++;
					else if (status === 'FAIL') coverage.fail++;
					else if (status === 'PENDING') coverage.pending++;
					else if (status === 'BLOCKED') coverage.blocked++;
					else if (status === 'SKIPPED') coverage.skipped++;
				}
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
		})
	);

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
