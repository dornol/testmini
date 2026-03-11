import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { issueLink, issueTrackerConfig, testCase } from '$lib/server/db/schema';
import { and, eq, ne } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { notFound } from '$lib/server/errors';
import { fetchIssueStatus } from '$lib/server/issue-tracker';

export const POST = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ projectId, url }) => {
		const config = await db.query.issueTrackerConfig.findFirst({
			where: eq(issueTrackerConfig.projectId, projectId)
		});
		if (!config) return notFound('Issue tracker not configured');

		const testCaseId = url.searchParams.get('testCaseId');
		const testExecutionId = url.searchParams.get('testExecutionId');

		const conditions = [eq(issueLink.projectId, projectId), ne(issueLink.provider, 'CUSTOM')];
		if (testCaseId) conditions.push(eq(issueLink.testCaseId, Number(testCaseId)));
		if (testExecutionId)
			conditions.push(eq(issueLink.testExecutionId, Number(testExecutionId)));

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
					const result = await fetchIssueStatus(
						configObj,
						link.externalUrl,
						link.externalKey
					);
					await db
						.update(issueLink)
						.set({ status: result.status, statusSyncedAt: new Date() })
						.where(eq(issueLink.id, link.id));

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
				.where(inArray(testCase.id, retestCaseIds));
		}

		return json({ synced, failed, total: links.length, retestMarked: retestCaseIds.length });
	}
);
