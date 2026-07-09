import { json, error } from '@sveltejs/kit';
import { badRequest } from '$lib/server/errors';
import { db } from '$lib/server/db';
import { issueTrackerConfig } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { withProjectRole, withProjectAccess } from '$lib/server/api-handler';
import { parseJsonBody } from '$lib/server/auth-utils';
import { childLogger } from '$lib/server/logger';
import { validatePublicHttpUrl } from '$lib/server/url-safety';
import { validateCustomIssueTemplate } from '$lib/server/integrations/custom-template';

const log = childLogger('issue-tracker-config');

const VALID_PROVIDERS = ['JIRA', 'GITHUB', 'GITLAB', 'GITEA', 'CUSTOM'];
const MAX_BASE_URL_LENGTH = 2000;
const MAX_PROJECT_KEY_LENGTH = 128;
const MAX_SECRET_LENGTH = 4000;

type IssueTrackerConfigPayload = {
	provider: string;
	baseUrl: string;
	apiToken?: string | null;
	projectKey?: string | null;
	customTemplate?: Record<string, unknown> | null;
	enabled?: boolean;
	webhookSecret?: string | null;
};

function validateRequestBody(body: unknown): Record<string, unknown> | Response {
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return badRequest('Invalid request body');
	}
	return body as Record<string, unknown>;
}

function requireTrimmedString(value: unknown, label: string, maxLength: number): string | Response {
	if (typeof value !== 'string') {
		return badRequest(`${label} is required`);
	}
	const trimmed = value.trim();
	if (!trimmed) {
		return badRequest(`${label} is required`);
	}
	if (trimmed.length > maxLength) {
		return badRequest(`${label} must be ${maxLength} characters or less`);
	}
	return trimmed;
}

function optionalTrimmedString(
	value: unknown,
	label: string,
	maxLength: number
): string | null | undefined | Response {
	if (value === undefined) return undefined;
	if (value === null) return null;
	if (typeof value !== 'string') {
		return badRequest(`${label} must be a string`);
	}
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (trimmed.length > maxLength) {
		return badRequest(`${label} must be ${maxLength} characters or less`);
	}
	return trimmed;
}

function optionalCustomTemplate(
	value: unknown
): Record<string, unknown> | null | undefined | Response {
	if (value === undefined) return undefined;
	if (value === null) return null;
	const validation = validateCustomIssueTemplate(value);
	if (!validation.ok) return badRequest(validation.error);
	return validation.template;
}

function optionalBoolean(value: unknown, label: string): boolean | undefined | Response {
	if (value === undefined) return undefined;
	if (typeof value !== 'boolean') {
		return badRequest(`${label} must be a boolean`);
	}
	return value;
}

async function validateBaseUrl(value: unknown): Promise<string | Response> {
	const baseUrl = requireTrimmedString(value, 'Base URL', MAX_BASE_URL_LENGTH);
	if (baseUrl instanceof Response) return baseUrl;

	try {
		const parsed = new URL(baseUrl);
		if (!['http:', 'https:'].includes(parsed.protocol)) {
			return badRequest('Base URL must use http or https');
		}
		if (parsed.username || parsed.password) {
			return badRequest('Base URL must not include credentials');
		}
	} catch {
		return badRequest('Invalid base URL');
	}

	const urlValidation = await validatePublicHttpUrl(baseUrl);
	if (!urlValidation.ok) return badRequest(urlValidation.error ?? 'Invalid base URL');

	return baseUrl;
}

async function validatePayload(
	body: Record<string, unknown>
): Promise<IssueTrackerConfigPayload | Response> {
	const provider = requireTrimmedString(body.provider, 'Provider', 32);
	if (provider instanceof Response) return provider;
	if (!VALID_PROVIDERS.includes(provider)) {
		return badRequest(`Provider must be one of: ${VALID_PROVIDERS.join(', ')}`);
	}

	const baseUrl = await validateBaseUrl(body.baseUrl);
	if (baseUrl instanceof Response) return baseUrl;

	const apiToken = optionalTrimmedString(body.apiToken, 'API token', MAX_SECRET_LENGTH);
	if (apiToken instanceof Response) return apiToken;

	const projectKey = optionalTrimmedString(body.projectKey, 'Project key', MAX_PROJECT_KEY_LENGTH);
	if (projectKey instanceof Response) return projectKey;

	const webhookSecret = optionalTrimmedString(
		body.webhookSecret,
		'Webhook secret',
		MAX_SECRET_LENGTH
	);
	if (webhookSecret instanceof Response) return webhookSecret;

	const customTemplate = optionalCustomTemplate(body.customTemplate);
	if (customTemplate instanceof Response) return customTemplate;

	const enabled = optionalBoolean(body.enabled, 'Enabled');
	if (enabled instanceof Response) return enabled;

	return { provider, baseUrl, apiToken, projectKey, webhookSecret, customTemplate, enabled };
}

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
		hasWebhookSecret: !!config.webhookSecret,
		createdAt: config.createdAt
	});
});

export const DELETE = withProjectRole(['PROJECT_ADMIN'], async ({ projectId }) => {
	await db.delete(issueTrackerConfig).where(eq(issueTrackerConfig.projectId, projectId));
	return json({ success: true });
});

export const POST = withProjectRole(['PROJECT_ADMIN'], async ({ request, user, projectId }) => {
	let rawBody: unknown;
	try {
		rawBody = await parseJsonBody(request);
	} catch {
		error(400, 'Invalid request body');
	}

	const bodyOrError = validateRequestBody(rawBody);
	if (bodyOrError instanceof Response) return bodyOrError;

	const payloadOrError = await validatePayload(bodyOrError);
	if (payloadOrError instanceof Response) return payloadOrError;
	const body = payloadOrError;

	const existing = await db.query.issueTrackerConfig.findFirst({
		where: eq(issueTrackerConfig.projectId, projectId)
	});

	if (existing) {
		// Update existing config
		const updates: Record<string, unknown> = {
			provider: body.provider,
			baseUrl: body.baseUrl
		};

		if (body.apiToken !== undefined) {
			updates.apiToken = body.apiToken;
			log.info({ projectId, tokenLength: body.apiToken?.length ?? 0 }, 'Updating API token');
		} else {
			log.info({ projectId }, 'API token not included in payload, keeping existing');
		}
		if (body.projectKey !== undefined) {
			updates.projectKey = body.projectKey;
		}
		if (body.customTemplate !== undefined) {
			updates.customTemplate = body.customTemplate;
		}
		if (body.enabled !== undefined) {
			updates.enabled = body.enabled;
		}
		if (body.webhookSecret !== undefined) {
			updates.webhookSecret = body.webhookSecret;
		}

		await db
			.update(issueTrackerConfig)
			.set(updates)
			.where(
				and(eq(issueTrackerConfig.id, existing.id), eq(issueTrackerConfig.projectId, projectId))
			);

		const updated = await db.query.issueTrackerConfig.findFirst({
			where: and(
				eq(issueTrackerConfig.id, existing.id),
				eq(issueTrackerConfig.projectId, projectId)
			)
		});

		return json({
			id: updated!.id,
			provider: updated!.provider,
			baseUrl: updated!.baseUrl,
			projectKey: updated!.projectKey,
			customTemplate: updated!.customTemplate,
			enabled: updated!.enabled,
			hasApiToken: !!updated!.apiToken,
			hasWebhookSecret: !!updated!.webhookSecret,
			createdAt: updated!.createdAt
		});
	}

	// Create new config
	const [created] = await db
		.insert(issueTrackerConfig)
		.values({
			projectId,
			provider: body.provider,
			baseUrl: body.baseUrl,
			apiToken: body.apiToken ?? null,
			projectKey: body.projectKey ?? null,
			customTemplate: body.customTemplate ?? null,
			enabled: body.enabled ?? true,
			webhookSecret: body.webhookSecret ?? null,
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
			hasWebhookSecret: !!created.webhookSecret,
			createdAt: created.createdAt
		},
		{ status: 201 }
	);
});
