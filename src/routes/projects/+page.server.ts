import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db, col } from '$lib/server/db';
import { project, projectMember } from '$lib/server/db/schema';
import { and, eq, ilike, count, desc, inArray, sql } from 'drizzle-orm';
import { isGlobalAdmin } from '$lib/server/auth-utils';
import { parsePositiveIntegerSearchParam } from '$lib/server/search-param-validation';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		redirect(302, '/auth/login');
	}

	const user = locals.user as App.Locals['user'] & { role?: string };
	const page = parsePositiveIntegerSearchParam(url.searchParams.get('page'), 1);
	const limit = parsePositiveIntegerSearchParam(url.searchParams.get('limit'), 12, { max: 50 });
	const search = url.searchParams.get('search')?.trim() ?? '';
	const active = url.searchParams.get('active') !== 'false';
	const offset = (page - 1) * limit;

	const conditions = [eq(project.active, active)];

	if (search) {
		conditions.push(ilike(project.name, `%${search}%`));
	}

	const canManageInactive = isGlobalAdmin(user!);
	if (!canManageInactive) {
		const memberProjects = db
			.select({ projectId: projectMember.projectId })
			.from(projectMember)
			.where(eq(projectMember.userId, user!.id));
		conditions.push(inArray(project.id, memberProjects));
	}

	const where = and(...conditions);

	const [projects, totalResult] = await Promise.all([
		db
			.select({
				id: project.id,
				name: project.name,
				description: project.description,
				active: project.active,
				createdAt: project.createdAt,
				memberCount:
					sql<number>`(select count(*)::int from project_member where project_id = ${col(project.id)})`.as(
						'member_count'
					)
			})
			.from(project)
			.where(where)
			.orderBy(desc(project.createdAt), desc(project.id))
			.limit(limit)
			.offset(offset),
		db.select({ total: count() }).from(project).where(where)
	]);

	const total = totalResult[0]?.total ?? 0;
	const totalPages = Math.ceil(total / limit);
	const lastPage = Math.max(totalPages, 1);
	if (page > lastPage) {
		const params = new URLSearchParams(url.searchParams);
		if (lastPage === 1) params.delete('page');
		else params.set('page', String(lastPage));
		redirect(302, `/projects${params.size ? `?${params}` : ''}`);
	}

	return {
		projects,
		meta: {
			page,
			limit,
			total,
			totalPages
		},
		search,
		active,
		canManageInactive
	};
};
