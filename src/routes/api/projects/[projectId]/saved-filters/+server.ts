import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { savedFilter } from '$lib/server/db/schema';
import { and, eq, asc } from 'drizzle-orm';
import { withProjectAccess } from '$lib/server/api-handler';
import { badRequest, conflict } from '$lib/server/errors';
import { parseJsonBody } from '$lib/server/auth-utils';

const MAX_FILTER_NAME_LENGTH = 100;
const MAX_FILTER_JSON_LENGTH = 20_000;
const ALLOWED_FILTER_TYPES = new Set(['test_cases', 'test_runs']);

function validateFilterType(value: unknown): string | Response {
	const filterType = value ?? 'test_cases';
	if (typeof filterType !== 'string' || !ALLOWED_FILTER_TYPES.has(filterType)) {
		return badRequest('Invalid filter type');
	}
	return filterType;
}

function validateFilterName(value: unknown): string | Response {
	if (typeof value !== 'string') return badRequest('Name is required');
	const name = value.trim();
	if (!name) return badRequest('Name is required');
	if (name.length > MAX_FILTER_NAME_LENGTH) {
		return badRequest(`Name must be ${MAX_FILTER_NAME_LENGTH} characters or less`);
	}
	return name;
}

function validateFilters(
	value: unknown,
	requiredMessage: string
): Record<string, unknown> | Response {
	if (
		!value ||
		typeof value !== 'object' ||
		Array.isArray(value) ||
		Object.getPrototypeOf(value) !== Object.prototype
	) {
		return badRequest(requiredMessage);
	}
	if (JSON.stringify(value).length > MAX_FILTER_JSON_LENGTH) {
		return badRequest(`Filters must be ${MAX_FILTER_JSON_LENGTH} characters or less`);
	}
	return value as Record<string, unknown>;
}

export const GET = withProjectAccess(async ({ user, projectId, url }) => {
	const filterTypeOrError = validateFilterType(url.searchParams.get('type') ?? undefined);
	if (filterTypeOrError instanceof Response) return filterTypeOrError;
	const filterType = filterTypeOrError;

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
	const body = (await parseJsonBody(request)) as Record<string, unknown>;

	const nameOrError = validateFilterName(body.name);
	if (nameOrError instanceof Response) return nameOrError;
	const name = nameOrError;

	const filterTypeOrError = validateFilterType(body.filterType);
	if (filterTypeOrError instanceof Response) return filterTypeOrError;
	const filterType = filterTypeOrError;

	const filtersOrError = validateFilters(body.filters, 'Filters object is required');
	if (filtersOrError instanceof Response) return filtersOrError;
	const filters = filtersOrError;

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
