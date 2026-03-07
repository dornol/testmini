import { json, error } from '@sveltejs/kit';
import { badRequest } from '$lib/server/errors';
import { db } from '$lib/server/db';
import { testCaseTemplate, type TestStep } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectAccess, withProjectRole } from '$lib/server/api-handler';

export const GET = withProjectAccess(async ({ params, projectId }) => {
	const templateId = Number(params.templateId);

	const template = await db.query.testCaseTemplate.findFirst({
		where: and(
			eq(testCaseTemplate.id, templateId),
			eq(testCaseTemplate.projectId, projectId)
		)
	});

	if (!template) {
		error(404, 'Template not found');
	}

	return json(template);
});

export const PATCH = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ request, params, projectId }) => {
	const templateId = Number(params.templateId);

	const template = await db.query.testCaseTemplate.findFirst({
		where: and(
			eq(testCaseTemplate.id, templateId),
			eq(testCaseTemplate.projectId, projectId)
		)
	});

	if (!template) {
		error(404, 'Template not found');
	}

	const body = await parseJsonBody(request);
	const { name, description, precondition, steps, priority } = body as {
		name?: string;
		description?: string;
		precondition?: string;
		steps?: { action: string; expected: string }[];
		priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
	};

	if (name !== undefined) {
		if (!name || name.trim().length === 0) {
			return badRequest('Template name is required');
		}
		if (name.length > 200) {
			return badRequest('Template name must be 200 characters or less');
		}
	}

	if (priority && !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(priority)) {
		return badRequest('Invalid priority value');
	}

	type TemplateUpdate = {
		name?: string;
		description?: string | null;
		precondition?: string | null;
		steps?: TestStep[];
		priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
	};

	const updates: TemplateUpdate = {};
	if (name !== undefined) updates.name = name.trim();
	if (description !== undefined) updates.description = description || null;
	if (precondition !== undefined) updates.precondition = precondition || null;
	if (priority !== undefined) updates.priority = priority;
	if (steps !== undefined) {
		updates.steps = steps.map((s, i) => ({
			order: i + 1,
			action: s.action,
			expected: s.expected
		}));
	}

	if (Object.keys(updates).length === 0) {
		return json({ success: true });
	}

	await db
		.update(testCaseTemplate)
		.set(updates)
		.where(eq(testCaseTemplate.id, templateId));

	return json({ success: true });
});

export const DELETE = withProjectRole(['PROJECT_ADMIN'], async ({ params, projectId }) => {
	const templateId = Number(params.templateId);

	const template = await db.query.testCaseTemplate.findFirst({
		where: and(
			eq(testCaseTemplate.id, templateId),
			eq(testCaseTemplate.projectId, projectId)
		)
	});

	if (!template) {
		error(404, 'Template not found');
	}

	await db
		.delete(testCaseTemplate)
		.where(eq(testCaseTemplate.id, templateId));

	return json({ success: true });
});
