import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { user, projectMember } from '$lib/server/db/schema';
import { withAuth } from '$lib/server/api-handler';
import { ilike, or, notInArray, and, eq } from 'drizzle-orm';

export const GET = withAuth(async ({ url }) => {

	const q = url.searchParams.get('q') ?? '';
	const excludeProjectId = url.searchParams.get('excludeProjectId');
	const offset = Number(url.searchParams.get('offset') ?? '0');

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
		.limit(10)
		.offset(offset);

	return json({ data: users });
});
