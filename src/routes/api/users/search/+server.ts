import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { user, projectMember, teamMember } from '$lib/server/db/schema';
import { withAuth } from '$lib/server/api-handler';
import { isGlobalAdmin, requireProjectRole } from '$lib/server/auth-utils';
import { ilike, or, notInArray, and, eq } from 'drizzle-orm';
import { badRequest } from '$lib/server/errors';
import {
	parseNonNegativeIntegerSearchParam,
	parseOptionalPositiveIntegerSearchParam
} from '$lib/server/search-param-validation';

const MAX_OFFSET = 10_000;
const MAX_QUERY_LENGTH = 100;

function parseNonNegativeIntegerParam(value: string | null, label: string): number {
	return parseNonNegativeIntegerSearchParam(value, label, { max: MAX_OFFSET });
}

function parsePositiveIntegerParam(value: string | null, label: string): number | null {
	return parseOptionalPositiveIntegerSearchParam(value, label);
}

async function requireTeamAdmin(currentUser: NonNullable<App.Locals['user']>, teamId: number) {
	if (isGlobalAdmin(currentUser)) return;

	const membership = await db.query.teamMember.findFirst({
		where: and(eq(teamMember.teamId, teamId), eq(teamMember.userId, currentUser.id))
	});

	if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
		error(403, 'You do not have the required role for this action');
	}
}

export const GET = withAuth(async ({ url, user: currentUser }) => {
	const q = (url.searchParams.get('q') ?? '').trim();
	const excludeProjectIdValue = url.searchParams.get('excludeProjectId');
	const teamIdValue = url.searchParams.get('teamId');
	let offset: number;
	let excludeProjectId: number | null;
	let teamId: number | null;

	try {
		offset = parseNonNegativeIntegerParam(url.searchParams.get('offset'), 'offset');
		excludeProjectId = parsePositiveIntegerParam(excludeProjectIdValue, 'excludeProjectId');
		teamId = parsePositiveIntegerParam(teamIdValue, 'teamId');
	} catch (err) {
		return badRequest(err instanceof Error ? err.message : 'Invalid search parameters');
	}

	if (!q || q.length < 2) {
		return json({ data: [] });
	}

	if (q.length > MAX_QUERY_LENGTH) {
		return badRequest(`q must be ${MAX_QUERY_LENGTH} characters or less`);
	}

	if (excludeProjectId === null && teamId === null) {
		return badRequest('A project or team context is required');
	}

	if (excludeProjectId !== null && teamId !== null) {
		return badRequest('Specify only one search context');
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

	if (teamId !== null) {
		await requireTeamAdmin(currentUser, teamId);

		const existingMembers = db
			.select({ userId: teamMember.userId })
			.from(teamMember)
			.where(eq(teamMember.teamId, teamId));

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
