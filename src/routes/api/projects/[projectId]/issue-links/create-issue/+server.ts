import { json } from '@sveltejs/kit';
import { badRequest, notFound } from '$lib/server/errors';
import { db } from '$lib/server/db';
import { issueTrackerConfig, issueLink } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { createExternalIssue } from '$lib/server/issue-tracker';
import { env } from '$env/dynamic/private';
import { parseJsonBody } from '$lib/server/auth-utils';
import { redactSecrets } from '$lib/server/secret-redaction';
import {
	validateOptionalTestCaseId,
	validateOptionalTestExecutionId
} from '$lib/server/project-reference-validation';
import { parseCanonicalPositiveInteger } from '$lib/server/search-param-validation';
import { isPlainRecord } from '$lib/server/object-validation';

const MAX_TITLE_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 10000;
const MAX_EXTERNAL_URL_LENGTH = 2000;
const MAX_EXTERNAL_KEY_LENGTH = 128;

type CreateIssuePayload = {
	testCaseId?: number;
	testExecutionId?: number;
	title: string;
	description: string;
};

function parsePositiveInteger(value: unknown, label: string): number | undefined | Response {
	if (value === undefined || value === null || value === '') return undefined;
	if (typeof value === 'number') {
		if (!Number.isSafeInteger(value) || value <= 0) {
			return badRequest(`${label} must be a positive integer`);
		}
		return value;
	}

	if (typeof value !== 'string') return badRequest(`${label} must be a positive integer`);

	const parsed = parseCanonicalPositiveInteger(value);
	if (parsed === null) return badRequest(`${label} must be a positive integer`);
	return parsed;
}

function validateRequestBody(body: unknown): Record<string, unknown> | Response {
	if (!isPlainRecord(body)) {
		return badRequest('Invalid request body');
	}
	return body;
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
): string | Response {
	if (value === undefined || value === null) return '';
	if (typeof value !== 'string') {
		return badRequest(`${label} must be a string`);
	}
	const trimmed = value.trim();
	if (trimmed.length > maxLength) {
		return badRequest(`${label} must be ${maxLength} characters or less`);
	}
	return trimmed;
}

function validateExternalUrl(value: unknown): string | Response {
	const externalUrl = requireTrimmedString(value, 'External URL', MAX_EXTERNAL_URL_LENGTH);
	if (externalUrl instanceof Response) return externalUrl;

	try {
		const parsed = new URL(externalUrl);
		if (!['http:', 'https:'].includes(parsed.protocol)) {
			return badRequest('External issue URL must use http or https');
		}
		if (parsed.username || parsed.password) {
			return badRequest('External issue URL must not include credentials');
		}
	} catch {
		return badRequest('Invalid external issue URL');
	}

	return externalUrl;
}

function validatePayload(body: Record<string, unknown>): CreateIssuePayload | Response {
	const testCaseId = parsePositiveInteger(body.testCaseId, 'testCaseId');
	if (testCaseId instanceof Response) return testCaseId;

	const testExecutionId = parsePositiveInteger(body.testExecutionId, 'testExecutionId');
	if (testExecutionId instanceof Response) return testExecutionId;

	if (!testCaseId && !testExecutionId) {
		return badRequest('Either testCaseId or testExecutionId is required');
	}

	const title = requireTrimmedString(body.title, 'Title', MAX_TITLE_LENGTH);
	if (title instanceof Response) return title;

	const description = optionalTrimmedString(
		body.description,
		'Description',
		MAX_DESCRIPTION_LENGTH
	);
	if (description instanceof Response) return description;

	return { testCaseId, testExecutionId, title, description };
}

export const POST = withProjectRole(
	['PROJECT_ADMIN', 'QA', 'DEV'],
	async ({ request, user, projectId }) => {
		const bodyOrError = validateRequestBody(await parseJsonBody(request));
		if (bodyOrError instanceof Response) return bodyOrError;

		const payloadOrError = validatePayload(bodyOrError);
		if (payloadOrError instanceof Response) return payloadOrError;
		const body = payloadOrError;

		const testCaseError = await validateOptionalTestCaseId(body.testCaseId, projectId);
		if (testCaseError) return testCaseError;
		const testExecutionError = await validateOptionalTestExecutionId(
			body.testExecutionId,
			projectId
		);
		if (testExecutionError) return testExecutionError;

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
				body.title,
				body.description,
				backlink || undefined
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to create external issue';
			return badRequest(redactSecrets(message, [config.apiToken]));
		}

		const externalUrl = validateExternalUrl(result.url);
		if (externalUrl instanceof Response) return externalUrl;

		const externalKey = optionalTrimmedString(result.key, 'External key', MAX_EXTERNAL_KEY_LENGTH);
		if (externalKey instanceof Response) return externalKey;

		const externalTitle = optionalTrimmedString(result.title, 'Title', MAX_TITLE_LENGTH);
		if (externalTitle instanceof Response) return externalTitle;

		const [created] = await db
			.insert(issueLink)
			.values({
				projectId,
				testCaseId: body.testCaseId ?? null,
				testExecutionId: body.testExecutionId ?? null,
				externalUrl,
				externalKey: externalKey || null,
				title: externalTitle || body.title,
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
