import { badRequest } from '$lib/server/errors';

const DEFAULT_MAX_IDS = 500;

export function validateRequestBody(body: unknown): Record<string, unknown> | Response {
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return badRequest('Invalid request body');
	}
	return body as Record<string, unknown>;
}

export function validatePositiveInteger(value: unknown, label: string): number | Response {
	const parsed = typeof value === 'number' ? value : Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		return badRequest(`${label} must be a positive integer`);
	}
	return parsed;
}

export function validatePositiveIntegerList(
	value: unknown,
	label: string,
	options: { maxItems?: number } = {}
): number[] | Response {
	const maxItems = options.maxItems ?? DEFAULT_MAX_IDS;
	if (!Array.isArray(value) || value.length === 0) {
		return badRequest(`${label} must be a non-empty array`);
	}
	if (value.length > maxItems) {
		return badRequest(`${label} must contain ${maxItems} items or less`);
	}

	const ids: number[] = [];
	const seen = new Set<number>();
	for (const item of value) {
		const parsed = validatePositiveInteger(item, `${label} items`);
		if (parsed instanceof Response) return parsed;
		if (seen.has(parsed)) {
			return badRequest(`${label} must not contain duplicates`);
		}
		seen.add(parsed);
		ids.push(parsed);
	}

	return ids;
}
