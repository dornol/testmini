import { json, error } from '@sveltejs/kit';
import { badRequest } from '$lib/server/errors';
import { db } from '$lib/server/db';
import { requirement } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { parseJsonBody, parseId } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';
import { validateRequirementFields } from '$lib/server/requirement-validation';

export const PATCH = withProjectRole(
	['PROJECT_ADMIN', 'QA'],
	async ({ request, params, projectId }) => {
		const requirementId = parseId(params.requirementId, 'requirement ID');

		const existing = await db.query.requirement.findFirst({
			where: and(eq(requirement.id, requirementId), eq(requirement.projectId, projectId))
		});

		if (!existing) {
			error(404, 'Requirement not found');
		}

		const body = await parseJsonBody(request);
		const fields = validateRequirementFields(body);
		if (fields instanceof Response) return fields;

		const updates: Record<string, unknown> = {};
		if (fields.title !== undefined) updates.title = fields.title;
		if (fields.externalId !== undefined) updates.externalId = fields.externalId;
		if (fields.description !== undefined) updates.description = fields.description;
		if (fields.source !== undefined) updates.source = fields.source;

		if (Object.keys(updates).length === 0) {
			return badRequest('No fields to update');
		}

		await db
			.update(requirement)
			.set(updates)
			.where(and(eq(requirement.id, requirementId), eq(requirement.projectId, projectId)));

		const updated = await db.query.requirement.findFirst({
			where: and(eq(requirement.id, requirementId), eq(requirement.projectId, projectId))
		});

		return json(updated);
	}
);

export const DELETE = withProjectRole(['PROJECT_ADMIN', 'QA'], async ({ params, projectId }) => {
	const requirementId = parseId(params.requirementId, 'requirement ID');

	const existing = await db.query.requirement.findFirst({
		where: and(eq(requirement.id, requirementId), eq(requirement.projectId, projectId))
	});

	if (!existing) {
		error(404, 'Requirement not found');
	}

	await db
		.delete(requirement)
		.where(and(eq(requirement.id, requirementId), eq(requirement.projectId, projectId)));

	return json({ success: true });
});
