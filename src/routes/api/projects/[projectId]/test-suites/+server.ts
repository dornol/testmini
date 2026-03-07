import { json, error } from '@sveltejs/kit';
import { validationError } from '$lib/server/errors';
import { db } from '$lib/server/db';
import { testSuite, testSuiteItem, user } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { createTestSuiteSchema } from '$lib/schemas/test-suite.schema';

export const GET = withProjectAccess(async ({ projectId }) => {

	const suites = await db
		.select({
			id: testSuite.id,
			name: testSuite.name,
			description: testSuite.description,
			createdBy: user.name,
			createdAt: testSuite.createdAt,
			itemCount: sql<number>`(select count(*) from test_suite_item where suite_id = ${testSuite.id})`.as('item_count')
		})
		.from(testSuite)
		.innerJoin(user, eq(testSuite.createdBy, user.id))
		.where(eq(testSuite.projectId, projectId))
		.orderBy(testSuite.name);

	return json(suites);
});

export const POST = withProjectRole(['PROJECT_ADMIN', 'QA'], async ({ request, user, projectId }) => {

	const body = await parseJsonBody(request);
	const parsed = createTestSuiteSchema.safeParse(body);
	if (!parsed.success) {
		return validationError('Invalid input', parsed.error.flatten().fieldErrors);
	}

	const { name, description, testCaseIds } = parsed.data;

	const suite = await db.transaction(async (tx) => {
		const [created] = await tx
			.insert(testSuite)
			.values({
				projectId,
				name,
				description: description || null,
				createdBy: user.id
			})
			.returning();

		if (testCaseIds.length > 0) {
			await tx.insert(testSuiteItem).values(
				testCaseIds.map((tcId) => ({
					suiteId: created.id,
					testCaseId: tcId
				}))
			);
		}

		return created;
	});

	return json({ id: suite.id }, { status: 201 });
});
