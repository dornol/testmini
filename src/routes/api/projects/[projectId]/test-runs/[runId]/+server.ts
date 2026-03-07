import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testRun } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';
import { updateTestRunSchema } from '$lib/schemas/test-run.schema';
import { badRequest, conflict, validationError } from '$lib/server/errors';

export const PATCH = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ request, params, projectId }) => {
	const runId = Number(params.runId);

	const run = await db.query.testRun.findFirst({
		where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
	});

	if (!run) {
		error(404, 'Test run not found');
	}

	if (run.status !== 'CREATED') {
		return conflict('Only CREATED runs can be edited');
	}

	const body = await parseJsonBody(request);
	const parsed = updateTestRunSchema.safeParse(body);
	if (!parsed.success) {
		return validationError('Invalid input', parsed.error.flatten().fieldErrors);
	}

	const updates: Record<string, unknown> = {};
	if (parsed.data.name !== undefined) updates.name = parsed.data.name;
	if (parsed.data.environment !== undefined) updates.environment = parsed.data.environment;

	if (Object.keys(updates).length === 0) {
		return badRequest('No fields to update');
	}

	await db
		.update(testRun)
		.set(updates)
		.where(and(eq(testRun.id, runId), eq(testRun.projectId, projectId)));

	return json({ success: true });
});

export const DELETE = withProjectRole(['PROJECT_ADMIN'], async ({ params, projectId }) => {
	const runId = Number(params.runId);

	const run = await db.query.testRun.findFirst({
		where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
	});

	if (!run) {
		error(404, 'Test run not found');
	}

	// Cascade delete: executions + failure_details are deleted via FK cascade
	await db.delete(testRun).where(and(eq(testRun.id, runId), eq(testRun.projectId, projectId)));

	return json({ success: true });
});
