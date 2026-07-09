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
const UNSAFE_FILTER_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function validateRequestBody(body: unknown): Record<string, unknown> | Response {
	if (
		!body ||
		typeof body !== 'object' ||
		Array.isArray(body) ||
		Object.getPrototypeOf(body) !== Object.prototype
	) {
		return badRequest('Invalid request body');
	}
	return body as Record<string, unknown>;
}

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
	if (containsUnsafeFilterKey(value)) {
		return badRequest('Filters contain an unsafe key');
	}
	return value as Record<string, unknown>;
}

function containsUnsafeFilterKey(value: unknown): boolean {
	if (Array.isArray(value)) {
		return value.some((item) => containsUnsafeFilterKey(item));
	}
	if (!value || typeof value !== 'object') {
		return false;
	}
	for (const [key, child] of Object.entries(value)) {
		if (UNSAFE_FILTER_KEYS.has(key) || containsUnsafeFilterKey(child)) {
			return true;
		}
	}
	return false;
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
	const bodyOrError = validateRequestBody(await parseJsonBody(request));
	if (bodyOrError instanceof Response) return bodyOrError;
	const body = bodyOrError;

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
