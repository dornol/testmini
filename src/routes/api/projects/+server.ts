import { error, json } from '@sveltejs/kit';
import { db, col } from '$lib/server/db';
import { project, projectMember, priorityConfig, environmentConfig } from '$lib/server/db/schema';
import { isGlobalAdmin, parseJsonObjectBody } from '$lib/server/auth-utils';
import { createProjectSchema } from '$lib/schemas/project.schema';
import { badRequest, validationError } from '$lib/server/errors';
import { and, eq, ilike, count, inArray, sql } from 'drizzle-orm';
import { logAudit } from '$lib/server/audit';
import { withAuth } from '$lib/server/api-handler';
import { parsePositiveIntegerSearchParamStrict } from '$lib/server/search-param-validation';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;
const MAX_SEARCH_LENGTH = 100;

export const GET = withAuth(async ({ user, url }) => {
	let page: number;
	let limit: number;

	try {
		page = parsePositiveIntegerSearchParamStrict(url.searchParams.get('page'), 'page', {
			defaultValue: DEFAULT_PAGE
		});
		limit = parsePositiveIntegerSearchParamStrict(url.searchParams.get('limit'), 'limit', {
			defaultValue: DEFAULT_LIMIT,
			max: MAX_LIMIT
		});
	} catch (err) {
		return badRequest(err instanceof Error ? err.message : 'Invalid pagination parameters');
	}

	const search = (url.searchParams.get('search') ?? '').trim();
	if (search.length > MAX_SEARCH_LENGTH) {
		return badRequest(`search must be ${MAX_SEARCH_LENGTH} characters or less`);
	}
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
				memberCount:
					sql<number>`(select count(*)::int from project_member where project_id = ${col(project.id)})`.as(
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
});

export const POST = withAuth(async ({ user, request }) => {
	const body = await parseJsonObjectBody(request);
	const result = createProjectSchema.safeParse(body);

	if (!result.success) {
		return validationError(
			'Validation failed',
			result.error.flatten().fieldErrors as Record<string, string[]>
		);
	}

	const { name, description } = result.data;

	// Transaction: create project + add creator as PROJECT_ADMIN + seed default priorities
	const newProject = await db.transaction(async (tx) => {
		const [created] = await tx
			.insert(project)
			.values({
				name,
				description: description || null,
				createdBy: user.id
			})
			.returning({ id: project.id, name: project.name, description: project.description });

		if (!created) {
			error(500, 'Failed to create project');
		}

		const [member] = await tx
			.insert(projectMember)
			.values({
				projectId: created.id,
				userId: user.id,
				role: 'PROJECT_ADMIN'
			})
			.returning({ projectId: projectMember.projectId });

		if (!member) {
			error(500, 'Failed to create project owner membership');
		}

		// Seed default priorities
		const priorityValues = [
			{
				projectId: created.id,
				name: 'LOW',
				color: '#6b7280',
				position: 0,
				isDefault: false,
				createdBy: user.id
			},
			{
				projectId: created.id,
				name: 'MEDIUM',
				color: '#3b82f6',
				position: 1,
				isDefault: true,
				createdBy: user.id
			},
			{
				projectId: created.id,
				name: 'HIGH',
				color: '#f97316',
				position: 2,
				isDefault: false,
				createdBy: user.id
			},
			{
				projectId: created.id,
				name: 'CRITICAL',
				color: '#ef4444',
				position: 3,
				isDefault: false,
				createdBy: user.id
			}
		];
		const insertedPriorities = await tx
			.insert(priorityConfig)
			.values(priorityValues)
			.returning({ id: priorityConfig.id });
		if (insertedPriorities.length !== priorityValues.length) {
			error(500, 'Failed to create default project priorities');
		}

		// Seed default environments
		const environmentValues = [
			{
				projectId: created.id,
				name: 'DEV',
				color: '#3b82f6',
				position: 0,
				isDefault: true,
				createdBy: user.id
			},
			{
				projectId: created.id,
				name: 'QA',
				color: '#8b5cf6',
				position: 1,
				isDefault: false,
				createdBy: user.id
			},
			{
				projectId: created.id,
				name: 'STAGE',
				color: '#f97316',
				position: 2,
				isDefault: false,
				createdBy: user.id
			},
			{
				projectId: created.id,
				name: 'PROD',
				color: '#ef4444',
				position: 3,
				isDefault: false,
				createdBy: user.id
			}
		];
		const insertedEnvironments = await tx
			.insert(environmentConfig)
			.values(environmentValues)
			.returning({ id: environmentConfig.id });
		if (insertedEnvironments.length !== environmentValues.length) {
			error(500, 'Failed to create default project environments');
		}

		return created;
	});

	// Fire-and-forget audit log — do NOT await
	logAudit({
		userId: user.id,
		action: 'CREATE_PROJECT',
		entityType: 'PROJECT',
		entityId: String(newProject.id),
		projectId: newProject.id,
		metadata: { name: newProject.name }
	});

	return json({ data: newProject }, { status: 201 });
});
