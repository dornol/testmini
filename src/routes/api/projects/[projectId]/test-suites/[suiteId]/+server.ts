import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { testSuite, testSuiteItem, testCase, testCaseVersion, user } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, requireProjectRole, requireProjectAccess } from '$lib/server/auth-utils';
import { updateTestSuiteSchema } from '$lib/schemas/test-suite.schema';

export const GET: RequestHandler = async ({ locals, params }) => {
	const authUser = requireAuth(locals);
	const projectId = Number(params.projectId);
	const suiteId = Number(params.suiteId);
	await requireProjectAccess(authUser, projectId);

	const suite = await db.query.testSuite.findFirst({
		where: and(eq(testSuite.id, suiteId), eq(testSuite.projectId, projectId))
	});

	if (!suite) {
		error(404, 'Suite not found');
	}

	const items = await db
		.select({
			id: testSuiteItem.id,
			testCaseId: testCase.id,
			key: testCase.key,
			title: testCaseVersion.title,
			priority: testCaseVersion.priority
		})
		.from(testSuiteItem)
		.innerJoin(testCase, eq(testSuiteItem.testCaseId, testCase.id))
		.innerJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
		.where(eq(testSuiteItem.suiteId, suiteId))
		.orderBy(testCase.key);

	return json({ ...suite, items });
};

export const PATCH: RequestHandler = async ({ request, locals, params }) => {
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

	const body = await request.json();
	const parsed = updateTestSuiteSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }, { status: 400 });
	}

	const updates: Record<string, unknown> = {};
	if (parsed.data.name !== undefined) updates.name = parsed.data.name;
	if (parsed.data.description !== undefined) updates.description = parsed.data.description;

	if (Object.keys(updates).length === 0) {
		return json({ error: 'No fields to update' }, { status: 400 });
	}

	await db
		.update(testSuite)
		.set(updates)
		.where(and(eq(testSuite.id, suiteId), eq(testSuite.projectId, projectId)));

	return json({ success: true });
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
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

	await db.delete(testSuite).where(and(eq(testSuite.id, suiteId), eq(testSuite.projectId, projectId)));

	return json({ success: true });
};
