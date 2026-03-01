import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { user, projectMember } from '$lib/server/db/schema';
import { requireAuth } from '$lib/server/auth-utils';
import { ilike, or, notInArray, and, eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ locals, url }) => {
	requireAuth(locals);

	const q = url.searchParams.get('q') ?? '';
	const excludeProjectId = url.searchParams.get('excludeProjectId');

	if (!q || q.length < 2) {
		return json({ data: [] });
	}

	const searchCondition = or(ilike(user.name, `%${q}%`), ilike(user.email, `%${q}%`));

	const conditions = [searchCondition];

	if (excludeProjectId) {
		const existingMembers = db
			.select({ userId: projectMember.userId })
			.from(projectMember)
			.where(eq(projectMember.projectId, Number(excludeProjectId)));

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
		.limit(10);

	return json({ data: users });
};
