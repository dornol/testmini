import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { savedFilter } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { withProjectAccess } from '$lib/server/api-handler';
import { badRequest, notFound } from '$lib/server/errors';
import { parseJsonBody, parseId } from '$lib/server/auth-utils';

async function findOwnedFilter(userId: string, projectId: number, filterId: number) {
	return db.query.savedFilter.findFirst({
		where: and(
			eq(savedFilter.id, filterId),
			eq(savedFilter.projectId, projectId),
			eq(savedFilter.userId, userId)
		)
	});
}

export const PATCH = withProjectAccess(async ({ request, user, projectId, params }) => {
	const filterId = parseId(params.filterId, 'filter ID');

	const existing = await findOwnedFilter(user.id, projectId, filterId);
	if (!existing) return notFound('Saved filter not found');

	const body = await parseJsonBody(request) as { name?: string; filters?: Record<string, unknown> };

	const updates: Record<string, unknown> = {};

	if (body.name !== undefined) {
		const name = body.name.trim();
		if (!name) return badRequest('Name cannot be empty');
		if (name.length > 100) return badRequest('Name must be 100 characters or less');
		updates.name = name;
	}

	if (body.filters !== undefined) {
		if (!body.filters || typeof body.filters !== 'object') {
			return badRequest('Filters must be an object');
		}
		updates.filters = body.filters;
	}

	if (Object.keys(updates).length === 0) {
		return badRequest('No fields to update');
	}

	const [updated] = await db
		.update(savedFilter)
		.set(updates)
		.where(eq(savedFilter.id, filterId))
		.returning();

	return json(updated);
});

export const DELETE = withProjectAccess(async ({ user, projectId, params }) => {
	const filterId = parseId(params.filterId, 'filter ID');

	const existing = await findOwnedFilter(user.id, projectId, filterId);
	if (!existing) return notFound('Saved filter not found');

	await db.delete(savedFilter).where(eq(savedFilter.id, filterId));

	return json({ success: true });
});
