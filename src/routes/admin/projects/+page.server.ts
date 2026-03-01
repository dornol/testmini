import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { project, projectMember } from '$lib/server/db/schema';
import { eq, ilike, count, desc, sql } from 'drizzle-orm';
import { requireAuth, isGlobalAdmin } from '$lib/server/auth-utils';

export const load: PageServerLoad = async ({ url }) => {
	const pg = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const limit = 20;
	const search = url.searchParams.get('search') || '';
	const showInactive = url.searchParams.get('inactive') === 'true';

	const conditions = [];
	if (search) {
		conditions.push(ilike(project.name, `%${search}%`));
	}
	if (!showInactive) {
		conditions.push(eq(project.active, true));
	}

	const where = conditions.length > 0
		? conditions.length === 1
			? conditions[0]
			: sql`${conditions[0]} AND ${conditions[1]}`
		: undefined;

	const [total] = await db.select({ count: count() }).from(project).where(where);

	const projects = await db
		.select({
			id: project.id,
			name: project.name,
			active: project.active,
			createdAt: project.createdAt,
			memberCount: sql<number>`(select count(*) from project_member where project_id = ${project.id})`.as(
				'member_count'
			)
		})
		.from(project)
		.where(where)
		.orderBy(desc(project.createdAt))
		.limit(limit)
		.offset((pg - 1) * limit);

	return {
		projects,
		search,
		showInactive,
		pagination: {
			page: pg,
			limit,
			total: total.count,
			totalPages: Math.ceil(total.count / limit)
		}
	};
};

export const actions: Actions = {
	toggleActive: async ({ request, locals }) => {
		const authUser = requireAuth(locals);
		if (!isGlobalAdmin(authUser)) {
			return fail(403, { error: 'Admin access required' });
		}

		const formData = await request.formData();
		const projectId = Number(formData.get('projectId'));
		const active = formData.get('active') === 'true';

		if (isNaN(projectId)) {
			return fail(400, { error: 'Invalid project ID' });
		}

		await db
			.update(project)
			.set({ active })
			.where(eq(project.id, projectId));

		return { success: true };
	}
};
