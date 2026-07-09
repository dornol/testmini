import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { issueLink, issueTrackerConfig, testCase } from '$lib/server/db/schema';
import { and, eq, ne } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { badRequest, notFound } from '$lib/server/errors';
import { fetchIssueStatus } from '$lib/server/issue-tracker';

function parsePositiveInteger(value: string | null, label: string): number | undefined | Response {
	if (value === null || value === '') return undefined;
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		return badRequest(`${label} must be a positive integer`);
	}
	return parsed;
}

export const POST = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ projectId, url }) => {
	const testCaseId = url.searchParams.get('testCaseId');
	const testExecutionId = url.searchParams.get('testExecutionId');

	const parsedTestCaseId = parsePositiveInteger(testCaseId, 'testCaseId');
	if (parsedTestCaseId instanceof Response) return parsedTestCaseId;

	const parsedTestExecutionId = parsePositiveInteger(testExecutionId, 'testExecutionId');
	if (parsedTestExecutionId instanceof Response) return parsedTestExecutionId;

	const config = await db.query.issueTrackerConfig.findFirst({
		where: eq(issueTrackerConfig.projectId, projectId)
	});
	if (!config) return notFound('Issue tracker not configured');

	const conditions = [eq(issueLink.projectId, projectId), ne(issueLink.provider, 'CUSTOM')];

	if (parsedTestCaseId !== undefined) {
		conditions.push(eq(issueLink.testCaseId, parsedTestCaseId));
	}
	if (parsedTestExecutionId !== undefined) {
		conditions.push(eq(issueLink.testExecutionId, parsedTestExecutionId));
	}

	const links = await db
		.select()
		.from(issueLink)
		.where(and(...conditions));

	const configObj = {
		provider: config.provider,
		baseUrl: config.baseUrl,
		apiToken: config.apiToken,
		projectKey: config.projectKey,
		customTemplate: config.customTemplate as Record<string, unknown> | null
	};

	let synced = 0;
	let failed = 0;
	const retestCaseIds: number[] = [];

	const BATCH_SIZE = 5;
	for (let i = 0; i < links.length; i += BATCH_SIZE) {
		const batch = links.slice(i, i + BATCH_SIZE);
		const results = await Promise.allSettled(
			batch.map(async (link) => {
				const result = await fetchIssueStatus(configObj, link.externalUrl, link.externalKey);
				await db
					.update(issueLink)
					.set({ status: result.status, statusSyncedAt: new Date() })
					.where(and(eq(issueLink.id, link.id), eq(issueLink.projectId, projectId)));

				// Track test cases that need retesting
				if (result.statusCategory === 'done' && link.testCaseId) {
					retestCaseIds.push(link.testCaseId);
				}
				return result;
			})
		);

		for (const r of results) {
			if (r.status === 'fulfilled') synced++;
			else failed++;
		}
	}

	// Mark linked test cases as retest needed
	if (retestCaseIds.length > 0) {
		const { inArray } = await import('drizzle-orm');
		await db
			.update(testCase)
			.set({ retestNeeded: true })
			.where(and(inArray(testCase.id, retestCaseIds), eq(testCase.projectId, projectId)));
	}

	return json({ synced, failed, total: links.length, retestMarked: retestCaseIds.length });
});
