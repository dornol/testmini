import { error } from '@sveltejs/kit';

/**
 * Parse a numeric resource ID from route params.
 * Throws 400 if the value is not a finite number.
 */
export function parseResourceId(params: Record<string, string>, key: string): number {
	const id = Number(params[key]);
	if (!Number.isFinite(id)) {
		error(400, `Invalid ${key}`);
	}
	return id;
}

/**
 * Parse pagination parameters from URL search params.
 * Returns page (1-based), limit (clamped), and offset.
 */
export function parsePagination(
	url: URL,
	defaults: { limit?: number; maxLimit?: number } = {}
): { page: number; limit: number; offset: number } {
	const maxLimit = defaults.maxLimit ?? 50;
	const defaultLimit = defaults.limit ?? 20;

	const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'));
	const limit = Math.min(maxLimit, Math.max(1, parseInt(url.searchParams.get('limit') ?? String(defaultLimit))));
	const offset = (page - 1) * limit;

	return { page, limit, offset };
}

/**
 * Build a standard pagination response object.
 */
export function paginationMeta(total: number, page: number, limit: number) {
	return {
		page,
		limit,
		total,
		pages: Math.ceil(total / limit)
	};
}
