import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCaseParameter } from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { parseJsonBody, parseId } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';
import { requireTestCase } from '$lib/server/queries';
import { badRequest, notFound } from '$lib/server/errors';
import { validateUpdateParameterInput } from '$lib/server/parameter-validation';

export const PATCH = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ params, request, projectId }) => {
		const testCaseId = parseId(params.testCaseId, 'test case ID');
		const parameterId = parseId(params.parameterId, 'parameter ID');
		await requireTestCase(testCaseId, projectId);

		const parameterOrError = validateUpdateParameterInput(await parseJsonBody(request));
		if (parameterOrError instanceof Response) return parameterOrError;

		const param = await db.query.testCaseParameter.findFirst({
			where: and(
				eq(testCaseParameter.id, parameterId),
				eq(testCaseParameter.testCaseId, testCaseId)
			)
		});
		if (!param) return notFound('Parameter not found');

		const updates: Partial<{ name: string; orderIndex: number }> = {};

		if (parameterOrError.name !== undefined) {
			const existing = await db.query.testCaseParameter.findFirst({
				where: and(
					eq(testCaseParameter.testCaseId, testCaseId),
					eq(testCaseParameter.name, parameterOrError.name)
				)
			});
			if (existing && existing.id !== parameterId)
				return badRequest('Parameter name already exists');
			updates.name = parameterOrError.name;
		}
		if (parameterOrError.orderIndex !== undefined) updates.orderIndex = parameterOrError.orderIndex;

		if (Object.keys(updates).length > 0) {
			const [updated] = await db
				.update(testCaseParameter)
				.set(updates)
				.where(
					and(
						eq(testCaseParameter.id, parameterId),
						eq(testCaseParameter.testCaseId, testCaseId),
						sql`exists (select 1 from test_case where id = ${testCaseId} and project_id = ${projectId})`
					)
				)
				.returning({ id: testCaseParameter.id });
			if (!updated) return notFound('Parameter not found');
		}

		return json({ success: true });
	}
);

export const DELETE = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ params, projectId }) => {
		const testCaseId = parseId(params.testCaseId, 'test case ID');
		const parameterId = parseId(params.parameterId, 'parameter ID');
		await requireTestCase(testCaseId, projectId);

		const param = await db.query.testCaseParameter.findFirst({
			where: and(
				eq(testCaseParameter.id, parameterId),
				eq(testCaseParameter.testCaseId, testCaseId)
			)
		});
		if (!param) return notFound('Parameter not found');

		const [deleted] = await db
			.delete(testCaseParameter)
			.where(
				and(
					eq(testCaseParameter.id, parameterId),
					eq(testCaseParameter.testCaseId, testCaseId),
					sql`exists (select 1 from test_case where id = ${testCaseId} and project_id = ${projectId})`
				)
			)
			.returning({ id: testCaseParameter.id });
		if (!deleted) return notFound('Parameter not found');

		return json({ success: true });
	}
);
