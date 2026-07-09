import { json, error } from '@sveltejs/kit';
import { badRequest, validationError } from '$lib/server/errors';
import { db } from '$lib/server/db';
import { testSuite, testSuiteItem, testCase, testCaseVersion, user } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { parseJsonObjectBody, parseId } from '$lib/server/auth-utils';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { updateTestSuiteSchema } from '$lib/schemas/test-suite.schema';

export const GET = withProjectAccess(async ({ params, projectId }) => {
	const suiteId = parseId(params.suiteId, 'suite ID');

	const suite = await db.query.testSuite.findFirst({
		where: and(eq(testSuite.id, suiteId), eq(testSuite.projectId, projectId))
	});

	if (!suite) {
		error(404, 'Suite not found');
	}

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
		.where(and(eq(testSuiteItem.suiteId, suiteId), eq(testCase.projectId, projectId)))
		.orderBy(testCase.key);

	return json({ ...suite, items });
});

export const PATCH = withProjectRole(
	['PROJECT_ADMIN', 'QA'],
	async ({ request, params, projectId }) => {
		const suiteId = parseId(params.suiteId, 'suite ID');

		const suite = await db.query.testSuite.findFirst({
			where: and(eq(testSuite.id, suiteId), eq(testSuite.projectId, projectId))
		});

		if (!suite) {
			error(404, 'Suite not found');
		}

		const body = await parseJsonObjectBody(request);
		const parsed = updateTestSuiteSchema.safeParse(body);
		if (!parsed.success) {
			return validationError('Invalid input', parsed.error.flatten().fieldErrors);
		}

		const updates: Record<string, unknown> = {};
		if (parsed.data.name !== undefined) updates.name = parsed.data.name;
		if (parsed.data.description !== undefined) updates.description = parsed.data.description;

		if (Object.keys(updates).length === 0) {
			return badRequest('No fields to update');
		}

		const [updated] = await db
			.update(testSuite)
			.set(updates)
			.where(and(eq(testSuite.id, suiteId), eq(testSuite.projectId, projectId)))
			.returning();

		if (!updated) error(404, 'Suite not found');

		return json(updated);
	}
);

export const DELETE = withProjectRole(['PROJECT_ADMIN', 'QA'], async ({ params, projectId }) => {
	const suiteId = parseId(params.suiteId, 'suite ID');

	const suite = await db.query.testSuite.findFirst({
		where: and(eq(testSuite.id, suiteId), eq(testSuite.projectId, projectId))
	});

	if (!suite) {
		error(404, 'Suite not found');
	}

	const [deleted] = await db
		.delete(testSuite)
		.where(and(eq(testSuite.id, suiteId), eq(testSuite.projectId, projectId)))
		.returning();

	if (!deleted) error(404, 'Suite not found');

	return json({ success: true });
});
