import { json, error } from '@sveltejs/kit';
import { badRequest } from '$lib/server/errors';
import { db } from '$lib/server/db';
import { requirement, requirementTestCase } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';

export const POST = withProjectRole(['PROJECT_ADMIN', 'QA'], async ({ request, params, projectId }) => {
	const requirementId = Number(params.requirementId);

	const existing = await db.query.requirement.findFirst({
		where: and(eq(requirement.id, requirementId), eq(requirement.projectId, projectId))
	});

	if (!existing) {
		error(404, 'Requirement not found');
	}

	const body = (await parseJsonBody(request)) as { testCaseIds?: number[] };

	if (!body.testCaseIds || !Array.isArray(body.testCaseIds) || body.testCaseIds.length === 0) {
		return badRequest('testCaseIds is required and must be a non-empty array');
	}

	await db
		.insert(requirementTestCase)
		.values(
			body.testCaseIds.map((testCaseId) => ({
				requirementId,
				testCaseId
			}))
		)
		.onConflictDoNothing();

	return json({ linked: body.testCaseIds.length }, { status: 201 });
});

export const DELETE = withProjectRole(['PROJECT_ADMIN', 'QA'], async ({ url, params, projectId }) => {
	const requirementId = Number(params.requirementId);

	const existing = await db.query.requirement.findFirst({
		where: and(eq(requirement.id, requirementId), eq(requirement.projectId, projectId))
	});

	if (!existing) {
		error(404, 'Requirement not found');
	}

	const testCaseId = Number(url.searchParams.get('testCaseId'));
	if (!Number.isFinite(testCaseId)) {
		return badRequest('testCaseId query parameter is required');
	}

	await db
		.delete(requirementTestCase)
		.where(
			and(
				eq(requirementTestCase.requirementId, requirementId),
				eq(requirementTestCase.testCaseId, testCaseId)
			)
		);

	return json({ success: true });
});
