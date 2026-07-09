import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { issueLink, issueTrackerConfig } from '$lib/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { withProjectRole, withProjectAccess } from '$lib/server/api-handler';
import { parseJsonBody } from '$lib/server/auth-utils';
import {
	validateOptionalTestCaseId,
	validateOptionalTestExecutionId
} from '$lib/server/project-reference-validation';
import {
	parseIssueLinkPositiveInteger,
	validateIssueLinkCreateInput,
	validateIssueLinkRequestBody
} from '$lib/server/issue-link-validation';

export const GET = withProjectAccess(async ({ url, projectId }) => {
	const testCaseId = url.searchParams.get('testCaseId');
	const testExecutionId = url.searchParams.get('testExecutionId');

	const conditions = [eq(issueLink.projectId, projectId)];

	if (testCaseId) {
		const parsedTestCaseId = parseIssueLinkPositiveInteger(testCaseId, 'testCaseId');
		if (parsedTestCaseId instanceof Response) return parsedTestCaseId;
		if (parsedTestCaseId !== undefined) {
			conditions.push(eq(issueLink.testCaseId, parsedTestCaseId));
		}
	}
	if (testExecutionId) {
		const parsedTestExecutionId = parseIssueLinkPositiveInteger(testExecutionId, 'testExecutionId');
		if (parsedTestExecutionId instanceof Response) return parsedTestExecutionId;
		if (parsedTestExecutionId !== undefined) {
			conditions.push(eq(issueLink.testExecutionId, parsedTestExecutionId));
		}
	}

	const links = await db
		.select({
			id: issueLink.id,
			testCaseId: issueLink.testCaseId,
			testExecutionId: issueLink.testExecutionId,
			externalUrl: issueLink.externalUrl,
			externalKey: issueLink.externalKey,
			title: issueLink.title,
			status: issueLink.status,
			provider: issueLink.provider,
			createdAt: issueLink.createdAt
		})
		.from(issueLink)
		.where(and(...conditions))
		.orderBy(desc(issueLink.createdAt));

	return json(links);
});

export const POST = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ request, user, projectId }) => {
		const bodyOrError = validateIssueLinkRequestBody(await parseJsonBody(request));
		if (bodyOrError instanceof Response) return bodyOrError;

		const payloadOrError = validateIssueLinkCreateInput(bodyOrError);
		if (payloadOrError instanceof Response) return payloadOrError;
		const body = payloadOrError;

		const testCaseError = await validateOptionalTestCaseId(body.testCaseId, projectId);
		if (testCaseError) return testCaseError;
		const testExecutionError = await validateOptionalTestExecutionId(
			body.testExecutionId,
			projectId
		);
		if (testExecutionError) return testExecutionError;

		// Determine provider from project config or default to 'CUSTOM'
		const config = await db.query.issueTrackerConfig.findFirst({
			where: eq(issueTrackerConfig.projectId, projectId)
		});
		const provider = config?.provider ?? 'CUSTOM';

		const [created] = await db
			.insert(issueLink)
			.values({
				projectId,
				testCaseId: body.testCaseId ?? null,
				testExecutionId: body.testExecutionId ?? null,
				externalUrl: body.externalUrl,
				externalKey: body.externalKey ?? null,
				title: body.title ?? null,
				provider,
				createdBy: user.id
			})
			.returning();

		return json(
			{
				id: created.id,
				testCaseId: created.testCaseId,
				testExecutionId: created.testExecutionId,
				externalUrl: created.externalUrl,
				externalKey: created.externalKey,
				title: created.title,
				status: created.status,
				provider: created.provider,
				createdAt: created.createdAt
			},
			{ status: 201 }
		);
	}
);
