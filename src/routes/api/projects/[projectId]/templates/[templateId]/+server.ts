import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCaseTemplate, type TestStep } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { parseJsonBody, parseId } from '$lib/server/auth-utils';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';
import { validateUpdateTemplateInput } from '$lib/server/template-validation';

export const GET = withProjectAccess(async ({ params, projectId }) => {
	const templateId = parseId(params.templateId, 'template ID');

	const template = await db.query.testCaseTemplate.findFirst({
		where: and(eq(testCaseTemplate.id, templateId), eq(testCaseTemplate.projectId, projectId))
	});

	if (!template) {
		error(404, 'Template not found');
	}

	return json(template);
});

export const PATCH = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ request, params, projectId }) => {
		const templateId = parseId(params.templateId, 'template ID');

		const templateOrError = validateUpdateTemplateInput(await parseJsonBody(request));
		if (templateOrError instanceof Response) return templateOrError;

		type TemplateUpdate = {
			name?: string;
			description?: string | null;
			precondition?: string | null;
			steps?: TestStep[];
			priority?: string;
		};

		const updates: TemplateUpdate = {};
		if (templateOrError.name !== undefined) updates.name = templateOrError.name;
		if (templateOrError.description !== undefined)
			updates.description = templateOrError.description;
		if (templateOrError.precondition !== undefined)
			updates.precondition = templateOrError.precondition;
		if (templateOrError.priority !== undefined) updates.priority = templateOrError.priority;
		if (templateOrError.steps !== undefined) updates.steps = templateOrError.steps;

		if (Object.keys(updates).length === 0) {
			return json({ success: true });
		}

		const template = await db.query.testCaseTemplate.findFirst({
			where: and(eq(testCaseTemplate.id, templateId), eq(testCaseTemplate.projectId, projectId))
		});

		if (!template) {
			error(404, 'Template not found');
		}

		const [updated] = await db
			.update(testCaseTemplate)
			.set(updates)
			.where(and(eq(testCaseTemplate.id, templateId), eq(testCaseTemplate.projectId, projectId)))
			.returning({ id: testCaseTemplate.id });
		if (!updated) error(404, 'Template not found');

		return json({ success: true });
	}
);

export const DELETE = withProjectRole(['PROJECT_ADMIN'], async ({ params, projectId }) => {
	const templateId = parseId(params.templateId, 'template ID');

	const template = await db.query.testCaseTemplate.findFirst({
		where: and(eq(testCaseTemplate.id, templateId), eq(testCaseTemplate.projectId, projectId))
	});

	if (!template) {
		error(404, 'Template not found');
	}

	const [deleted] = await db
		.delete(testCaseTemplate)
		.where(and(eq(testCaseTemplate.id, templateId), eq(testCaseTemplate.projectId, projectId)))
		.returning({ id: testCaseTemplate.id });
	if (!deleted) error(404, 'Template not found');

	return json({ success: true });
});
