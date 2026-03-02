import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { testRun } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, requireProjectRole, parseJsonBody } from '$lib/server/auth-utils';
import { updateTestRunSchema } from '$lib/schemas/test-run.schema';

export const PATCH: RequestHandler = async ({ request, locals, params }) => {
	const user = requireAuth(locals);
	const projectId = Number(params.projectId);
	const runId = Number(params.runId);
	await requireProjectRole(user, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);

	const run = await db.query.testRun.findFirst({
		where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
	});

	if (!run) {
		error(404, 'Test run not found');
	}

	if (run.status !== 'CREATED') {
		return json({ error: 'Only CREATED runs can be edited' }, { status: 409 });
	}

	const body = await parseJsonBody(request);
	const parsed = updateTestRunSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 });
	}

	const updates: Record<string, unknown> = {};
	if (parsed.data.name !== undefined) updates.name = parsed.data.name;
	if (parsed.data.environment !== undefined) updates.environment = parsed.data.environment;

	if (Object.keys(updates).length === 0) {
		return json({ error: 'No fields to update' }, { status: 400 });
	}

	await db
		.update(testRun)
		.set(updates)
		.where(and(eq(testRun.id, runId), eq(testRun.projectId, projectId)));

	return json({ success: true });
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	const user = requireAuth(locals);
	const projectId = Number(params.projectId);
	const runId = Number(params.runId);
	await requireProjectRole(user, projectId, ['PROJECT_ADMIN']);

	const run = await db.query.testRun.findFirst({
		where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
	});

	if (!run) {
		error(404, 'Test run not found');
	}

	// Cascade delete: executions + failure_details are deleted via FK cascade
	await db.delete(testRun).where(and(eq(testRun.id, runId), eq(testRun.projectId, projectId)));

	return json({ success: true });
};
