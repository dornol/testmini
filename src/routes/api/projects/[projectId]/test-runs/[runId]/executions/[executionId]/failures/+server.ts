import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testFailureDetail, testExecution, testRun, testCaseVersion, issueLink, issueTrackerConfig } from '$lib/server/db/schema';
import { user } from '$lib/server/db/auth.schema';
import { eq, and } from 'drizzle-orm';
import { parseJsonBody } from '$lib/server/auth-utils';
import { withProjectRole } from '$lib/server/api-handler';
import { createFailureSchema } from '$lib/schemas/failure.schema';
import { badRequest } from '$lib/server/errors';
import { requireEditableRun } from '$lib/server/crud-helpers';
import { addIssueComment } from '$lib/server/issue-tracker';
import { childLogger } from '$lib/server/logger';

const log = childLogger('failure-issue-sync');

export const GET = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV', 'VIEWER'], async ({ params, projectId }) => {
	const runId = Number(params.runId);
	const executionId = Number(params.executionId);

	// Verify run belongs to project
	const run = await db.query.testRun.findFirst({
		where: and(eq(testRun.id, runId), eq(testRun.projectId, projectId))
	});

	if (!run) {
		error(404, 'Test run not found');
	}

	// Verify execution belongs to run
	const execution = await db.query.testExecution.findFirst({
		where: and(eq(testExecution.id, executionId), eq(testExecution.testRunId, runId))
	});

	if (!execution) {
		error(404, 'Execution not found');
	}

	const failures = await db
		.select({
			id: testFailureDetail.id,
			errorMessage: testFailureDetail.errorMessage,
			testMethod: testFailureDetail.testMethod,
			failureEnvironment: testFailureDetail.failureEnvironment,
			stackTrace: testFailureDetail.stackTrace,
			comment: testFailureDetail.comment,
			createdBy: testFailureDetail.createdBy,
			createdAt: testFailureDetail.createdAt,
			createdByName: user.name
		})
		.from(testFailureDetail)
		.leftJoin(user, eq(testFailureDetail.createdBy, user.id))
		.where(eq(testFailureDetail.testExecutionId, executionId))
		.orderBy(testFailureDetail.createdAt);

	return json({ failures });
});

export const POST = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ params, request, user, projectId }) => {
	const runId = Number(params.runId);
	const executionId = Number(params.executionId);

	await requireEditableRun(runId, projectId);

	const execution = await db.query.testExecution.findFirst({
		where: and(eq(testExecution.id, executionId), eq(testExecution.testRunId, runId))
	});

	if (!execution) {
		error(404, 'Execution not found');
	}

	const body = await parseJsonBody(request);
	const parsed = createFailureSchema.safeParse(body);
	if (!parsed.success) {
		return badRequest('Invalid failure detail data');
	}

	await db.transaction(async (tx) => {
		await tx
			.update(testExecution)
			.set({
				status: 'FAIL',
				executedBy: user.id,
				executedAt: new Date()
			})
			.where(eq(testExecution.id, executionId));

		await tx.insert(testFailureDetail).values({
			testExecutionId: executionId,
			failureEnvironment: parsed.data.failureEnvironment || null,
			testMethod: parsed.data.testMethod || null,
			errorMessage: parsed.data.errorMessage || null,
			stackTrace: parsed.data.stackTrace || null,
			comment: parsed.data.comment || null,
			createdBy: user.id
		});
	});

	// Resolve testCaseId from testCaseVersion, then sync failure to linked issues (fire-and-forget)
	const version = await db.query.testCaseVersion.findFirst({
		where: eq(testCaseVersion.id, execution.testCaseVersionId),
		columns: { testCaseId: true }
	});
	if (version?.testCaseId) {
		syncFailureToIssues(projectId, version.testCaseId, parsed.data).catch((err) => {
			log.error({ err, testCaseId: version.testCaseId }, 'Failed to sync failure to external issues');
		});
	}

	return json({ success: true });
});

async function syncFailureToIssues(
	projectId: number,
	testCaseId: number,
	failure: { errorMessage?: string; testMethod?: string; failureEnvironment?: string; stackTrace?: string; comment?: string }
) {
	// Find linked issues for this test case
	const links = await db
		.select()
		.from(issueLink)
		.where(and(eq(issueLink.projectId, projectId), eq(issueLink.testCaseId, testCaseId)));

	if (links.length === 0) return;

	// Load issue tracker config
	const config = await db.query.issueTrackerConfig.findFirst({
		where: and(eq(issueTrackerConfig.projectId, projectId), eq(issueTrackerConfig.enabled, true))
	});

	if (!config) return;

	const lines = ['**Test Failure Reported**'];
	if (failure.errorMessage) lines.push(`**Error:** ${failure.errorMessage}`);
	if (failure.testMethod) lines.push(`**Method:** ${failure.testMethod}`);
	if (failure.failureEnvironment) lines.push(`**Environment:** ${failure.failureEnvironment}`);
	if (failure.comment) lines.push(`**Comment:** ${failure.comment}`);
	if (failure.stackTrace) lines.push('', '```', failure.stackTrace.slice(0, 2000), '```');
	const commentBody = lines.join('\n');

	const trackerConfig = {
		provider: config.provider,
		baseUrl: config.baseUrl,
		apiToken: config.apiToken,
		projectKey: config.projectKey,
		customTemplate: config.customTemplate as Record<string, unknown> | null
	};

	for (const link of links) {
		try {
			await addIssueComment(trackerConfig, link.externalUrl, commentBody);
		} catch (err) {
			log.warn({ err, linkId: link.id }, 'Failed to add comment to external issue');
		}
	}
}
