import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { issueLink, issueTrackerConfig, testCase } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { notFound, badRequest } from '$lib/server/errors';
import { updateIssueState } from '$lib/server/issue-tracker';
import { parseJsonBody, parseId } from '$lib/server/auth-utils';
import { isPlainRecord } from '$lib/server/object-validation';

function validateRequestBody(body: unknown): Record<string, unknown> | Response {
	if (!isPlainRecord(body)) {
		return badRequest('Invalid request body');
	}
	return body;
}

function validateState(value: unknown): 'open' | 'closed' | Response {
	if (typeof value !== 'string') {
		return badRequest('State must be "open" or "closed"');
	}
	const state = value.trim();
	if (state !== 'open' && state !== 'closed') {
		return badRequest('State must be "open" or "closed"');
	}
	return state;
}

export const POST = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ request, projectId, params }) => {
		const linkId = parseId(params.linkId, 'link ID');

		let rawBody: unknown;
		try {
			rawBody = await parseJsonBody(request);
		} catch {
			error(400, 'Invalid request body');
		}

		const bodyOrError = validateRequestBody(rawBody);
		if (bodyOrError instanceof Response) return bodyOrError;

		const stateOrError = validateState(bodyOrError.state);
		if (stateOrError instanceof Response) return stateOrError;
		const state = stateOrError;

		const link = await db.query.issueLink.findFirst({
			where: and(eq(issueLink.id, linkId), eq(issueLink.projectId, projectId))
		});
		if (!link) return notFound('Issue link not found');

		const config = await db.query.issueTrackerConfig.findFirst({
			where: eq(issueTrackerConfig.projectId, projectId)
		});
		if (!config) return notFound('Issue tracker not configured');

		await updateIssueState(
			{
				provider: config.provider,
				baseUrl: config.baseUrl,
				apiToken: config.apiToken,
				projectKey: config.projectKey,
				customTemplate: config.customTemplate as Record<string, unknown> | null
			},
			link.externalUrl,
			state
		);

		// Update local status
		await db
			.update(issueLink)
			.set({ status: state, statusSyncedAt: new Date() })
			.where(and(eq(issueLink.id, linkId), eq(issueLink.projectId, projectId)));

		// Mark test case for retest when issue is closed
		if (state === 'closed' && link.testCaseId) {
			await db
				.update(testCase)
				.set({ retestNeeded: true })
				.where(and(eq(testCase.id, link.testCaseId), eq(testCase.projectId, projectId)));
		}

		return json({ success: true, state });
	}
);
