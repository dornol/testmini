import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCaseTemplate, user } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { validateCreateTemplateInput } from '$lib/server/template-validation';

export const GET = withProjectAccess(async ({ projectId }) => {
	const templates = await db
		.select({
			id: testCaseTemplate.id,
			name: testCaseTemplate.name,
			description: testCaseTemplate.description,
			precondition: testCaseTemplate.precondition,
			steps: testCaseTemplate.steps,
			priority: testCaseTemplate.priority,
			createdBy: user.name,
			createdAt: testCaseTemplate.createdAt,
			updatedAt: testCaseTemplate.updatedAt
		})
		.from(testCaseTemplate)
		.innerJoin(user, eq(testCaseTemplate.createdBy, user.id))
		.where(eq(testCaseTemplate.projectId, projectId))
		.orderBy(testCaseTemplate.name);

	return json(templates);
});

export const POST = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ request, user, projectId }) => {
		const templateOrError = validateCreateTemplateInput(await parseJsonBody(request));
		if (templateOrError instanceof Response) return templateOrError;

		const [created] = await db
			.insert(testCaseTemplate)
			.values({
				projectId,
				name: templateOrError.name,
				description: templateOrError.description ?? null,
				precondition: templateOrError.precondition ?? null,
				steps: templateOrError.steps ?? [],
				priority: templateOrError.priority ?? 'MEDIUM',
				createdBy: user.id
			})
			.returning();

		return json({ id: created.id }, { status: 201 });
	}
);
