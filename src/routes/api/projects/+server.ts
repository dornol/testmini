import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { project, projectMember } from '$lib/server/db/schema';
import { requireAuth, isGlobalAdmin } from '$lib/server/auth-utils';
import { createProjectSchema } from '$lib/schemas/project.schema';
import { and, eq, ilike, count, inArray, sql } from 'drizzle-orm';

export const GET: RequestHandler = async ({ locals, url }) => {
	const user = requireAuth(locals);

	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
	const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? '12')));
	const search = url.searchParams.get('search') ?? '';
	const active = url.searchParams.get('active') !== 'false';
	const offset = (page - 1) * limit;

	const conditions = [eq(project.active, active)];

	if (search) {
		conditions.push(ilike(project.name, `%${search}%`));
	}

	// Non-admin users can only see projects they are members of
	if (!isGlobalAdmin(user)) {
		const memberProjects = db
			.select({ projectId: projectMember.projectId })
			.from(projectMember)
			.where(eq(projectMember.userId, user.id));
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
				createdBy: project.createdBy,
				createdAt: project.createdAt,
				memberCount: sql<number>`(select count(*) from project_member where project_id = ${project.id})`.as(
					'member_count'
				)
			})
			.from(project)
			.where(where)
			.orderBy(project.createdAt)
			.limit(limit)
			.offset(offset),
		db.select({ total: count() }).from(project).where(where)
	]);

	const total = totalResult[0]?.total ?? 0;

	return json({
		data: projects,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit)
		}
	});
};

export const POST: RequestHandler = async ({ locals, request }) => {
	const user = requireAuth(locals);

	const body = await request.json();
	const result = createProjectSchema.safeParse(body);

	if (!result.success) {
		return json({ error: result.error.flatten().fieldErrors }, { status: 400 });
	}

	const { name, description } = result.data;

	// Transaction: create project + add creator as PROJECT_ADMIN
	const newProject = await db.transaction(async (tx) => {
		const [created] = await tx
			.insert(project)
			.values({
				name,
				description: description || null,
				createdBy: user.id
			})
			.returning();

		await tx.insert(projectMember).values({
			projectId: created.id,
			userId: user.id,
			role: 'PROJECT_ADMIN'
		});

		return created;
	});

	return json({ data: newProject }, { status: 201 });
};
