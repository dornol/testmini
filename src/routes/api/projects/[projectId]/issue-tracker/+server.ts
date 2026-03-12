import { json, error } from '@sveltejs/kit';
import { badRequest } from '$lib/server/errors';
import { db } from '$lib/server/db';
import { issueTrackerConfig } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { withProjectRole, withProjectAccess } from '$lib/server/api-handler';
import { parseJsonBody } from '$lib/server/auth-utils';

const VALID_PROVIDERS = ['JIRA', 'GITHUB', 'GITLAB', 'CUSTOM'];

export const GET = withProjectAccess(async ({ projectId }) => {
	const config = await db.query.issueTrackerConfig.findFirst({
		where: eq(issueTrackerConfig.projectId, projectId)
	});

	if (!config) {
		return json(null);
	}

	return json({
		id: config.id,
		provider: config.provider,
		baseUrl: config.baseUrl,
		projectKey: config.projectKey,
		customTemplate: config.customTemplate,
		enabled: config.enabled,
		hasApiToken: !!config.apiToken,
		createdAt: config.createdAt
	});
});

export const DELETE = withProjectRole(['PROJECT_ADMIN'], async ({ projectId }) => {
	await db
		.delete(issueTrackerConfig)
		.where(eq(issueTrackerConfig.projectId, projectId));
	return json({ success: true });
});

export const POST = withProjectRole(['PROJECT_ADMIN'], async ({ request, user, projectId }) => {
	let body: {
		provider?: string;
		baseUrl?: string;
		apiToken?: string;
		projectKey?: string;
		customTemplate?: Record<string, unknown>;
		enabled?: boolean;
	};
	try {
		body = await parseJsonBody(request) as typeof body;
	} catch {
		error(400, 'Invalid request body');
	}

	const provider = (body.provider ?? '').trim();
	if (!provider || !VALID_PROVIDERS.includes(provider)) {
		return badRequest(`Provider must be one of: ${VALID_PROVIDERS.join(', ')}`);
	}

	const baseUrl = (body.baseUrl ?? '').trim();
	if (!baseUrl) {
		return badRequest('Base URL is required');
	}
	try {
		const parsed = new URL(baseUrl);
		if (!['http:', 'https:'].includes(parsed.protocol)) {
			return badRequest('Base URL must use http or https');
		}
	} catch {
		return badRequest('Invalid base URL');
	}

	const existing = await db.query.issueTrackerConfig.findFirst({
		where: eq(issueTrackerConfig.projectId, projectId)
	});

	if (existing) {
		// Update existing config
		const updates: Record<string, unknown> = {
			provider,
			baseUrl
		};

		if (body.apiToken !== undefined) {
			updates.apiToken = body.apiToken?.trim() || null;
		}
		if (body.projectKey !== undefined) {
			updates.projectKey = body.projectKey?.trim() || null;
		}
		if (body.customTemplate !== undefined) {
			updates.customTemplate = body.customTemplate;
		}
		if (body.enabled !== undefined) {
			updates.enabled = body.enabled;
		}

		await db
			.update(issueTrackerConfig)
			.set(updates)
			.where(eq(issueTrackerConfig.id, existing.id));

		const updated = await db.query.issueTrackerConfig.findFirst({
			where: eq(issueTrackerConfig.id, existing.id)
		});

		return json({
			id: updated!.id,
			provider: updated!.provider,
			baseUrl: updated!.baseUrl,
			projectKey: updated!.projectKey,
			customTemplate: updated!.customTemplate,
			enabled: updated!.enabled,
			hasApiToken: !!updated!.apiToken,
			createdAt: updated!.createdAt
		});
	}

	// Create new config
	const [created] = await db
		.insert(issueTrackerConfig)
		.values({
			projectId,
			provider,
			baseUrl,
			apiToken: body.apiToken?.trim() || null,
			projectKey: body.projectKey?.trim() || null,
			customTemplate: body.customTemplate ?? null,
			enabled: body.enabled ?? true,
			createdBy: user.id
		})
		.returning();

	return json(
		{
			id: created.id,
			provider: created.provider,
			baseUrl: created.baseUrl,
			projectKey: created.projectKey,
			customTemplate: created.customTemplate,
			enabled: created.enabled,
			hasApiToken: !!created.apiToken,
			createdAt: created.createdAt
		},
		{ status: 201 }
	);
});
