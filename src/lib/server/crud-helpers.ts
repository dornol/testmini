import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testRun } from '$lib/server/db/schema';
import { eq, and, type SQL, type Table } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { badRequest } from '$lib/server/errors';

/**
 * Find a project-scoped resource by ID, or throw 404.
 */
export async function findOrFail(
	table: Table,
	idCol: SQL,
	projectIdCol: SQL,
	resourceId: number,
	projectId: number,
	label: string
) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const result = await (db.select().from(table as any) as any)
		.where(and(eq(idCol, resourceId), eq(projectIdCol, projectId)))
		.limit(1);

	if (result.length === 0) {
		error(404, `${label} not found`);
	}

	return result[0];
}

/**
 * Parse JSON body from a request and validate with a Zod schema.
 * Returns parsed data or throws a validation error response.
 */
export async function parseAndValidate<T>(
	request: Request,
	schema: { safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: { flatten: () => { fieldErrors: Record<string, string[]> } } } }
): Promise<T> {
	const body = await parseJsonBody(request);
	const parsed = schema.safeParse(body);
	if (!parsed.success) {
		throw badRequest('Invalid input');
	}
	return parsed.data;
}

/**
 * Build an update object from parsed data, including only defined fields.
 * Returns null if no fields to update.
 */
export function buildUpdates<T extends Record<string, unknown>>(
	data: Partial<T>,
	fields: (keyof T)[]
): Record<string, unknown> | null {
	const updates: Record<string, unknown> = {};
	for (const field of fields) {
		if (data[field] !== undefined) {
			updates[field as string] = data[field];
		}
	}
	return Object.keys(updates).length > 0 ? updates : null;
}

/**
 * Validate comment content: required, non-empty string, max 10000 chars.
 * Returns trimmed content or a 400 Response.
 */
export function validateCommentContent(content: unknown): string | Response {
	if (!content || typeof content !== 'string' || content.trim().length === 0) {
		return badRequest('Content is required');
	}
	if (content.trim().length > 10000) {
		return badRequest('Content is too long (max 10000 characters)');
	}
	return content.trim();
}

/**
 * Standard delete handler: verify existence then delete.
 */
export async function deleteResource(
	table: Table,
	idCol: SQL,
	projectIdCol: SQL,
	resourceId: number,
	projectId: number,
	label: string
): Promise<Response> {
	await findOrFail(table, idCol, projectIdCol, resourceId, projectId, label);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	await (db.delete(table as any) as any).where(and(eq(idCol, resourceId), eq(projectIdCol, projectId)));
	return json({ success: true });
}

/**
 * Verify a run belongs to the project and is not COMPLETED.
 * Returns the run or throws 404/403.
 */
export async function requireEditableRun(runId: number, projectId: number) {
	const run = await db.query.testRun.findFirst({
		where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
	});
	if (!run) {
		error(404, 'Test run not found');
	}
	if (run.status === 'COMPLETED') {
		error(403, 'Cannot modify executions in a completed run');
	}
	return run;
}
