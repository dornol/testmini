import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { savedFilter } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { withProjectAccess } from '$lib/server/api-handler';
import { badRequest, notFound } from '$lib/server/errors';
import { parseJsonBody, parseId } from '$lib/server/auth-utils';

const MAX_FILTER_NAME_LENGTH = 100;
const MAX_FILTER_JSON_LENGTH = 20_000;
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

function validateFilterName(value: unknown): string | Response {
	if (typeof value !== 'string') return badRequest('Name must be a string');
	const name = value.trim();
	if (!name) return badRequest('Name cannot be empty');
	if (name.length > MAX_FILTER_NAME_LENGTH) {
		return badRequest(`Name must be ${MAX_FILTER_NAME_LENGTH} characters or less`);
	}
	return name;
}

function validateFilters(value: unknown): Record<string, unknown> | Response {
	if (
		!value ||
		typeof value !== 'object' ||
		Array.isArray(value) ||
		Object.getPrototypeOf(value) !== Object.prototype
	) {
		return badRequest('Filters must be an object');
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

	const bodyOrError = validateRequestBody(await parseJsonBody(request));
	if (bodyOrError instanceof Response) return bodyOrError;
	const body = bodyOrError;

	const updates: Record<string, unknown> = {};

	if (body.name !== undefined) {
		const nameOrError = validateFilterName(body.name);
		if (nameOrError instanceof Response) return nameOrError;
		const name = nameOrError;
		updates.name = name;
	}

	if (body.filters !== undefined) {
		const filtersOrError = validateFilters(body.filters);
		if (filtersOrError instanceof Response) return filtersOrError;
		updates.filters = filtersOrError;
	}

	if (Object.keys(updates).length === 0) {
		return badRequest('No fields to update');
	}

	const [updated] = await db
		.update(savedFilter)
		.set(updates)
		.where(
			and(
				eq(savedFilter.id, filterId),
				eq(savedFilter.projectId, projectId),
				eq(savedFilter.userId, user.id)
			)
		)
		.returning();
	if (!updated) return notFound('Saved filter not found');

	return json(updated);
});

export const DELETE = withProjectAccess(async ({ user, projectId, params }) => {
	const filterId = parseId(params.filterId, 'filter ID');

	const existing = await findOwnedFilter(user.id, projectId, filterId);
	if (!existing) return notFound('Saved filter not found');

	await db
		.delete(savedFilter)
		.where(
			and(
				eq(savedFilter.id, filterId),
				eq(savedFilter.projectId, projectId),
				eq(savedFilter.userId, user.id)
			)
		);

	return json({ success: true });
});
