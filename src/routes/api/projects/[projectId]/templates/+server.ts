import { json, error } from '@sveltejs/kit';
import { badRequest } from '$lib/server/errors';
import { db } from '$lib/server/db';
import { testCaseTemplate, user } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';

export const GET = withProjectAccess(async ({ projectId }) => {
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
});

export const POST = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ request, user, projectId }) => {
	const body = await parseJsonBody(request);
	const { name, description, precondition, steps, priority } = body as {
		name: string;
		description?: string;
		precondition?: string;
		steps?: { action: string; expected: string }[];
		priority?: string;
	};

	if (!name || name.trim().length === 0) {
		return badRequest('Template name is required');
	}

	if (name.length > 200) {
		return badRequest('Template name must be 200 characters or less');
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
			createdBy: user.id
		})
		.returning();

	return json({ id: created.id }, { status: 201 });
});
