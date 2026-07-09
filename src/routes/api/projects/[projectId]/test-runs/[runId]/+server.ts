import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testRun } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { parseJsonObjectBody, parseId } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';
import { updateTestRunSchema } from '$lib/schemas/test-run.schema';
import { badRequest, conflict, validationError } from '$lib/server/errors';
import { validateOptionalReleaseId } from '$lib/server/project-reference-validation';

export const PATCH = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ request, params, projectId }) => {
		const runId = parseId(params.runId, 'run ID');

		const body = await parseJsonObjectBody(request);
		const parsed = updateTestRunSchema.safeParse(body);
		if (!parsed.success) {
			return validationError('Invalid input', parsed.error.flatten().fieldErrors);
		}

		const updates: Record<string, unknown> = {};
		if (parsed.data.name !== undefined) updates.name = parsed.data.name;
		if (parsed.data.environment !== undefined) updates.environment = parsed.data.environment;
		if (parsed.data.releaseId !== undefined) updates.releaseId = parsed.data.releaseId;

		if (Object.keys(updates).length === 0) {
			return badRequest('No fields to update');
		}

		const run = await db.query.testRun.findFirst({
			where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
		});

		if (!run) {
			error(404, 'Test run not found');
		}

		// Name/environment edits only allowed in CREATED status; releaseId can be set anytime
		const hasFieldEdits = parsed.data.name !== undefined || parsed.data.environment !== undefined;
		if (hasFieldEdits && run.status !== 'CREATED') {
			return conflict('Only CREATED runs can be edited');
		}

		const releaseError = await validateOptionalReleaseId(parsed.data.releaseId, projectId);
		if (releaseError) return releaseError;

		const [updated] = await db
			.update(testRun)
			.set(updates)
			.where(and(eq(testRun.id, runId), eq(testRun.projectId, projectId)))
			.returning();

		if (!updated) error(404, 'Test run not found');

		return json({ success: true });
	}
);

export const DELETE = withProjectRole(['PROJECT_ADMIN'], async ({ params, projectId }) => {
	const runId = parseId(params.runId, 'run ID');

	const run = await db.query.testRun.findFirst({
		where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
	});

	if (!run) {
		error(404, 'Test run not found');
	}

	// Cascade delete: executions + failure_details are deleted via FK cascade
	const [deleted] = await db
		.delete(testRun)
		.where(and(eq(testRun.id, runId), eq(testRun.projectId, projectId)))
		.returning();

	if (!deleted) error(404, 'Test run not found');

	return json({ success: true });
});
