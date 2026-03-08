import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { issueTrackerConfig } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { notFound } from '$lib/server/errors';
import { testConnection } from '$lib/server/issue-tracker';

export const POST = withProjectRole(['PROJECT_ADMIN'], async ({ projectId }) => {
	const config = await db.query.issueTrackerConfig.findFirst({
		where: eq(issueTrackerConfig.projectId, projectId)
	});

	if (!config) {
		return notFound('Issue tracker not configured for this project');
	}

	if (!config.enabled) {
		return json({ ok: false, message: 'Issue tracker is disabled' });
	}

	const result = await testConnection({
		provider: config.provider,
		baseUrl: config.baseUrl,
		apiToken: config.apiToken,
		projectKey: config.projectKey,
		customTemplate: config.customTemplate as Record<string, unknown> | null
	});

	return json(result);
});
