import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { savedFilter } from '$lib/server/db/schema';
import { and, eq, asc } from 'drizzle-orm';
import { withProjectAccess } from '$lib/server/api-handler';
import { badRequest, conflict } from '$lib/server/errors';

export const GET = withProjectAccess(async ({ user, projectId, url }) => {
	const filterType = url.searchParams.get('type') ?? 'test_cases';

	const filters = await db
		.select()
		.from(savedFilter)
		.where(
			and(
				eq(savedFilter.projectId, projectId),
				eq(savedFilter.userId, user.id),
				eq(savedFilter.filterType, filterType)
			)
		)
		.orderBy(asc(savedFilter.sortOrder), asc(savedFilter.name));

	return json(filters);
});

export const POST = withProjectAccess(async ({ request, user, projectId }) => {
	let body: { name?: string; filterType?: string; filters?: Record<string, unknown> };
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid JSON');
	}

	const name = (body.name ?? '').trim();
	if (!name) return badRequest('Name is required');
	if (name.length > 100) return badRequest('Name must be 100 characters or less');

	const filterType = body.filterType ?? 'test_cases';
	if (!['test_cases', 'test_runs'].includes(filterType)) {
		return badRequest('Invalid filter type');
	}

	const filters = body.filters;
	if (!filters || typeof filters !== 'object') {
		return badRequest('Filters object is required');
	}

	// Check uniqueness
	const existing = await db.query.savedFilter.findFirst({
		where: and(
			eq(savedFilter.projectId, projectId),
			eq(savedFilter.userId, user.id),
			eq(savedFilter.name, name)
		)
	});

	if (existing) return conflict('A saved view with this name already exists');

	const [created] = await db
		.insert(savedFilter)
		.values({
			projectId,
			userId: user.id,
			name,
			filterType,
			filters
		})
		.returning();

	return json(created, { status: 201 });
});
