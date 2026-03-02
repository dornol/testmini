import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { testSuite, testSuiteItem } from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { requireAuth, requireProjectRole, parseJsonBody } from '$lib/server/auth-utils';
import { suiteItemsSchema } from '$lib/schemas/test-suite.schema';

export const POST: RequestHandler = async ({ request, locals, params }) => {
	const authUser = requireAuth(locals);
	const projectId = Number(params.projectId);
	const suiteId = Number(params.suiteId);
	await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA']);

	const suite = await db.query.testSuite.findFirst({
		where: and(eq(testSuite.id, suiteId), eq(testSuite.projectId, projectId))
	});

	if (!suite) {
		error(404, 'Suite not found');
	}

	const body = await parseJsonBody(request);
	const parsed = suiteItemsSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 });
	}

	const values = parsed.data.testCaseIds.map((tcId) => ({
		suiteId,
		testCaseId: tcId
	}));

	// Use ON CONFLICT DO NOTHING to ignore duplicates
	for (const value of values) {
		try {
			await db.insert(testSuiteItem).values(value);
		} catch {
			// ignore duplicate constraint violations
		}
	}

	return json({ success: true });
};

export const DELETE: RequestHandler = async ({ request, locals, params }) => {
	const authUser = requireAuth(locals);
	const projectId = Number(params.projectId);
	const suiteId = Number(params.suiteId);
	await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA']);

	const suite = await db.query.testSuite.findFirst({
		where: and(eq(testSuite.id, suiteId), eq(testSuite.projectId, projectId))
	});

	if (!suite) {
		error(404, 'Suite not found');
	}

	const body = await parseJsonBody(request);
	const parsed = suiteItemsSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 });
	}

	await db
		.delete(testSuiteItem)
		.where(
			and(
				eq(testSuiteItem.suiteId, suiteId),
				inArray(testSuiteItem.testCaseId, parsed.data.testCaseIds)
			)
		);

	return json({ success: true });
};
