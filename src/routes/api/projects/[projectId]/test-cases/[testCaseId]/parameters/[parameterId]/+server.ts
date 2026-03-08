import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCase, testCaseParameter } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';
import { badRequest, notFound } from '$lib/server/errors';

export const PATCH = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ params, request, projectId }) => {
	const testCaseId = Number(params.testCaseId);
	const parameterId = Number(params.parameterId);

	const tc = await db.query.testCase.findFirst({
		where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
	});
	if (!tc) return notFound('Test case not found');

	const param = await db.query.testCaseParameter.findFirst({
		where: and(eq(testCaseParameter.id, parameterId), eq(testCaseParameter.testCaseId, testCaseId))
	});
	if (!param) return notFound('Parameter not found');

	const body = await parseJsonBody(request);
	const { name, orderIndex } = body as { name?: string; orderIndex?: number };

	const updates: Partial<{ name: string; orderIndex: number }> = {};

	if (name !== undefined) {
		if (!name.trim()) return badRequest('Parameter name cannot be empty');
		const existing = await db.query.testCaseParameter.findFirst({
			where: and(
				eq(testCaseParameter.testCaseId, testCaseId),
				eq(testCaseParameter.name, name.trim())
			)
		});
		if (existing && existing.id !== parameterId) return badRequest('Parameter name already exists');
		updates.name = name.trim();
	}
	if (orderIndex !== undefined) updates.orderIndex = orderIndex;

	if (Object.keys(updates).length > 0) {
		await db.update(testCaseParameter).set(updates).where(eq(testCaseParameter.id, parameterId));
	}

	return json({ success: true });
});

export const DELETE = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ params, projectId }) => {
	const testCaseId = Number(params.testCaseId);
	const parameterId = Number(params.parameterId);

	const tc = await db.query.testCase.findFirst({
		where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId))
	});
	if (!tc) return notFound('Test case not found');

	const param = await db.query.testCaseParameter.findFirst({
		where: and(eq(testCaseParameter.id, parameterId), eq(testCaseParameter.testCaseId, testCaseId))
	});
	if (!param) return notFound('Parameter not found');

	await db.delete(testCaseParameter).where(eq(testCaseParameter.id, parameterId));

	return json({ success: true });
});
