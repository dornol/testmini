import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { testCaseTemplate, user } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, requireProjectRole, requireProjectAccess, parseJsonBody } from '$lib/server/auth-utils';

export const GET: RequestHandler = async ({ locals, params }) => {
	const authUser = requireAuth(locals);
	const projectId = Number(params.projectId);
	await requireProjectAccess(authUser, projectId);

	const templates = await db
		.select({
			id: testCaseTemplate.id,
			name: testCaseTemplate.name,
			description: testCaseTemplate.description,
			precondition: testCaseTemplate.precondition,
			steps: testCaseTemplate.steps,
			priority: testCaseTemplate.priority,
			createdBy: user.name,
			createdAt: testCaseTemplate.createdAt,
			updatedAt: testCaseTemplate.updatedAt
		})
		.from(testCaseTemplate)
		.innerJoin(user, eq(testCaseTemplate.createdBy, user.id))
		.where(eq(testCaseTemplate.projectId, projectId))
		.orderBy(testCaseTemplate.name);

	return json(templates);
};

export const POST: RequestHandler = async ({ request, locals, params }) => {
	const authUser = requireAuth(locals);
	const projectId = Number(params.projectId);
	await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

	const body = await parseJsonBody(request);
	const { name, description, precondition, steps, priority } = body as {
		name: string;
		description?: string;
		precondition?: string;
		steps?: { action: string; expected: string }[];
		priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
	};

	if (!name || name.trim().length === 0) {
		return json({ error: 'Template name is required' }, { status: 400 });
	}

	if (name.length > 200) {
		return json({ error: 'Template name must be 200 characters or less' }, { status: 400 });
	}

	if (priority && !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(priority)) {
		return json({ error: 'Invalid priority value' }, { status: 400 });
	}

	const numberedSteps = (steps ?? []).map((s, i) => ({
		order: i + 1,
		action: s.action,
		expected: s.expected
	}));

	const [created] = await db
		.insert(testCaseTemplate)
		.values({
			projectId,
			name: name.trim(),
			description: description || null,
			precondition: precondition || null,
			steps: numberedSteps,
			priority: priority ?? 'MEDIUM',
			createdBy: authUser.id
		})
		.returning();

	return json({ id: created.id }, { status: 201 });
};
