import { json, error } from '@sveltejs/kit';
import { badRequest, notFound } from '$lib/server/errors';
import { db } from '$lib/server/db';
import { issueTrackerConfig, issueLink } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { createExternalIssue } from '$lib/server/issue-tracker';
import { env } from '$env/dynamic/private';
import { parseJsonBody } from '$lib/server/auth-utils';

export const POST = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ request, user, projectId }) => {
		let body: {
			testCaseId?: number;
			testExecutionId?: number;
			title?: string;
			description?: string;
		};
		try {
			body = await parseJsonBody(request) as typeof body;
		} catch {
			error(400, 'Invalid request body');
		}

		const title = (body.title ?? '').trim();
		if (!title) {
			return badRequest('Title is required');
		}

		const description = (body.description ?? '').trim();

		if (!body.testCaseId && !body.testExecutionId) {
			return badRequest('Either testCaseId or testExecutionId is required');
		}

		const config = await db.query.issueTrackerConfig.findFirst({
			where: eq(issueTrackerConfig.projectId, projectId)
		});

		if (!config) {
			return notFound('Issue tracker not configured for this project');
		}

		if (!config.enabled) {
			return badRequest('Issue tracker is disabled');
		}

		const origin = env.ORIGIN ?? '';
		let backlink = '';
		if (origin) {
			if (body.testCaseId) {
				backlink = `${origin}/projects/${projectId}/test-cases/${body.testCaseId}`;
			} else if (body.testExecutionId) {
				backlink = `${origin}/projects/${projectId}/test-runs`;
			}
		}

		let result;
		try {
			result = await createExternalIssue(
				{
					provider: config.provider,
					baseUrl: config.baseUrl,
					apiToken: config.apiToken,
					projectKey: config.projectKey,
					customTemplate: config.customTemplate as Record<string, unknown> | null
				},
				title,
				description,
				backlink || undefined
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to create external issue';
			return badRequest(message);
		}

		const [created] = await db
			.insert(issueLink)
			.values({
				projectId,
				testCaseId: body.testCaseId ?? null,
				testExecutionId: body.testExecutionId ?? null,
				externalUrl: result.url,
				externalKey: result.key,
				title: result.title,
				provider: config.provider,
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
