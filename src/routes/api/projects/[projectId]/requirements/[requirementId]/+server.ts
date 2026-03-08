import { json, error } from '@sveltejs/kit';
import { badRequest } from '$lib/server/errors';
import { db } from '$lib/server/db';
import { requirement } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';

export const PATCH = withProjectRole(['PROJECT_ADMIN', 'QA'], async ({ request, params, projectId }) => {
	const requirementId = Number(params.requirementId);

	const existing = await db.query.requirement.findFirst({
		where: and(eq(requirement.id, requirementId), eq(requirement.projectId, projectId))
	});

	if (!existing) {
		error(404, 'Requirement not found');
	}

	const body = (await parseJsonBody(request)) as {
		title?: string;
		externalId?: string;
		description?: string;
		source?: string;
	};

	const updates: Record<string, unknown> = {};
	if (body.title !== undefined) updates.title = body.title.trim();
	if (body.externalId !== undefined) updates.externalId = body.externalId?.trim() || null;
	if (body.description !== undefined) updates.description = body.description?.trim() || null;
	if (body.source !== undefined) updates.source = body.source?.trim() || null;

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
});

export const DELETE = withProjectRole(['PROJECT_ADMIN', 'QA'], async ({ params, projectId }) => {
	const requirementId = Number(params.requirementId);

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
