import { json, error } from '@sveltejs/kit';
import { badRequest } from '$lib/server/errors';
import { db } from '$lib/server/db';
import { issueLink, issueTrackerConfig } from '$lib/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { withProjectRole, withProjectAccess } from '$lib/server/api-handler';

export const GET = withProjectAccess(async ({ url, projectId }) => {
	const testCaseId = url.searchParams.get('testCaseId');
	const testExecutionId = url.searchParams.get('testExecutionId');

	const conditions = [eq(issueLink.projectId, projectId)];

	if (testCaseId) {
		conditions.push(eq(issueLink.testCaseId, Number(testCaseId)));
	}
	if (testExecutionId) {
		conditions.push(eq(issueLink.testExecutionId, Number(testExecutionId)));
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
		let body: {
			testCaseId?: number;
			testExecutionId?: number;
			externalUrl?: string;
			externalKey?: string;
			title?: string;
		};
		try {
			body = await request.json();
		} catch {
			error(400, 'Invalid request body');
		}

		const externalUrl = (body.externalUrl ?? '').trim();
		if (!externalUrl) {
			return badRequest('External URL is required');
		}
		try {
			const parsed = new URL(externalUrl);
			if (!['http:', 'https:'].includes(parsed.protocol)) {
				return badRequest('External URL must use http or https');
			}
		} catch {
			return badRequest('Invalid external URL');
		}

		if (!body.testCaseId && !body.testExecutionId) {
			return badRequest('Either testCaseId or testExecutionId is required');
		}

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
				externalUrl,
				externalKey: body.externalKey?.trim() || null,
				title: body.title?.trim() || null,
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
