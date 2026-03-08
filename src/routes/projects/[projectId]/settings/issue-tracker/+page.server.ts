import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { issueTrackerConfig } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, requireProjectRole } from '$lib/server/auth-utils';

export const load: PageServerLoad = async ({ params, locals }) => {
	const authUser = requireAuth(locals);
	const projectId = Number(params.projectId);
	await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN']);

	const config = await db.query.issueTrackerConfig.findFirst({
		where: eq(issueTrackerConfig.projectId, projectId)
	});

	if (!config) {
		return { issueTrackerConfig: null };
	}

	return {
		issueTrackerConfig: {
			id: config.id,
			provider: config.provider,
			baseUrl: config.baseUrl,
			projectKey: config.projectKey,
			customTemplate: config.customTemplate,
			enabled: config.enabled,
			hasApiToken: !!config.apiToken,
			createdAt: config.createdAt
		}
	};
};
