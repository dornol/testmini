import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { user, projectMember } from '$lib/server/db/schema';
import { withAuth } from '$lib/server/api-handler';
import { requireProjectRole } from '$lib/server/auth-utils';
import { ilike, or, notInArray, and, eq } from 'drizzle-orm';
import { badRequest } from '$lib/server/errors';

const MAX_OFFSET = 10_000;
const MAX_QUERY_LENGTH = 100;

function parseNonNegativeIntegerParam(value: string | null, label: string): number {
	if (value === null || value === '') return 0;

	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 0) {
		throw new Error(`Invalid ${label}`);
	}

	return Math.min(parsed, MAX_OFFSET);
}

function parsePositiveIntegerParam(value: string | null, label: string): number | null {
	if (value === null || value === '') return null;

	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		throw new Error(`Invalid ${label}`);
	}

	return parsed;
}

export const GET = withAuth(async ({ url, user: currentUser }) => {
	const q = (url.searchParams.get('q') ?? '').trim();
	const excludeProjectIdValue = url.searchParams.get('excludeProjectId');
	let offset: number;
	let excludeProjectId: number | null;

	try {
		offset = parseNonNegativeIntegerParam(url.searchParams.get('offset'), 'offset');
		excludeProjectId = parsePositiveIntegerParam(excludeProjectIdValue, 'excludeProjectId');
	} catch (err) {
		return badRequest(err instanceof Error ? err.message : 'Invalid search parameters');
	}

	if (!q || q.length < 2) {
		return json({ data: [] });
	}

	if (q.length > MAX_QUERY_LENGTH) {
		return badRequest(`q must be ${MAX_QUERY_LENGTH} characters or less`);
	}

	const searchCondition = or(ilike(user.name, `%${q}%`), ilike(user.email, `%${q}%`));

	const conditions = [searchCondition];

	if (excludeProjectId !== null) {
		await requireProjectRole(currentUser, excludeProjectId, ['PROJECT_ADMIN']);

		const existingMembers = db
			.select({ userId: projectMember.userId })
			.from(projectMember)
			.where(eq(projectMember.projectId, excludeProjectId));

		conditions.push(notInArray(user.id, existingMembers));
	}

	const users = await db
		.select({
			id: user.id,
			name: user.name,
			email: user.email
		})
		.from(user)
		.where(and(...conditions))
		.limit(10)
		.offset(offset);

	return json({ data: users });
});
