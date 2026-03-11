import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCase } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { parseJsonBody } from '$lib/server/auth-utils';
import { updateRiskSchema } from '$lib/schemas/risk.schema';
import { computeRiskLevel } from '$lib/server/risk-matrix';
import { badRequest, notFound } from '$lib/server/errors';

export const GET = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV', 'VIEWER'], async ({ params, projectId }) => {
	const testCaseId = Number(params.testCaseId);
	if (!Number.isFinite(testCaseId)) return badRequest('Invalid test case ID');

	const tc = await db.query.testCase.findFirst({
		where: and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId)),
		columns: { id: true, riskImpact: true, riskLikelihood: true, riskLevel: true }
	});

	if (!tc) return notFound('Test case not found');
	return json(tc);
});

export const PATCH = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ request, params, projectId }) => {
	const testCaseId = Number(params.testCaseId);
	if (!Number.isFinite(testCaseId)) return badRequest('Invalid test case ID');

	const body = await parseJsonBody(request);
	const parsed = updateRiskSchema.safeParse(body);
	if (!parsed.success) return badRequest('Invalid input');

	const { riskImpact, riskLikelihood } = parsed.data;
	const riskLevel = computeRiskLevel(riskImpact, riskLikelihood);

	const [updated] = await db
		.update(testCase)
		.set({ riskImpact, riskLikelihood, riskLevel })
		.where(and(eq(testCase.id, testCaseId), eq(testCase.projectId, projectId)))
		.returning({ id: testCase.id, riskImpact: testCase.riskImpact, riskLikelihood: testCase.riskLikelihood, riskLevel: testCase.riskLevel });

	if (!updated) return notFound('Test case not found');
	return json(updated);
});
