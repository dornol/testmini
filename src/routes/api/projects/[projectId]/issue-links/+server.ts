import { json } from '@sveltejs/kit';
import { badRequest } from '$lib/server/errors';
import { db } from '$lib/server/db';
import { issueLink, issueTrackerConfig } from '$lib/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { withProjectRole, withProjectAccess } from '$lib/server/api-handler';
import { parseJsonBody } from '$lib/server/auth-utils';

const MAX_EXTERNAL_URL_LENGTH = 2000;
const MAX_EXTERNAL_KEY_LENGTH = 128;
const MAX_TITLE_LENGTH = 500;

type IssueLinkPayload = {
	testCaseId?: number;
	testExecutionId?: number;
	externalUrl: string;
	externalKey?: string | null;
	title?: string | null;
};

function parsePositiveInteger(value: unknown, label: string): number | undefined | Response {
	if (value === undefined || value === null || value === '') return undefined;
	const parsed = typeof value === 'number' ? value : Number(value);
	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		return badRequest(`${label} must be a positive integer`);
	}
	return parsed;
}

function validateRequestBody(body: unknown): Record<string, unknown> | Response {
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return badRequest('Invalid request body');
	}
	return body as Record<string, unknown>;
}

function optionalTrimmedString(
	value: unknown,
	label: string,
	maxLength: number
): string | null | undefined | Response {
	if (value === undefined || value === null) return value;
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

function validateExternalUrl(value: unknown): string | Response {
	if (typeof value !== 'string') {
		return badRequest('External URL is required');
	}
	const externalUrl = value.trim();
	if (!externalUrl) {
		return badRequest('External URL is required');
	}
	if (externalUrl.length > MAX_EXTERNAL_URL_LENGTH) {
		return badRequest(`External URL must be ${MAX_EXTERNAL_URL_LENGTH} characters or less`);
	}
	try {
		const parsed = new URL(externalUrl);
		if (!['http:', 'https:'].includes(parsed.protocol)) {
			return badRequest('External URL must use http or https');
		}
		if (parsed.username || parsed.password) {
			return badRequest('External URL must not include credentials');
		}
	} catch {
		return badRequest('Invalid external URL');
	}
	return externalUrl;
}

function validatePayload(body: Record<string, unknown>): IssueLinkPayload | Response {
	const testCaseId = parsePositiveInteger(body.testCaseId, 'testCaseId');
	if (testCaseId instanceof Response) return testCaseId;

	const testExecutionId = parsePositiveInteger(body.testExecutionId, 'testExecutionId');
	if (testExecutionId instanceof Response) return testExecutionId;

	if (!testCaseId && !testExecutionId) {
		return badRequest('Either testCaseId or testExecutionId is required');
	}

	const externalUrl = validateExternalUrl(body.externalUrl);
	if (externalUrl instanceof Response) return externalUrl;

	const externalKey = optionalTrimmedString(
		body.externalKey,
		'External key',
		MAX_EXTERNAL_KEY_LENGTH
	);
	if (externalKey instanceof Response) return externalKey;

	const title = optionalTrimmedString(body.title, 'Title', MAX_TITLE_LENGTH);
	if (title instanceof Response) return title;

	return { testCaseId, testExecutionId, externalUrl, externalKey, title };
}

export const GET = withProjectAccess(async ({ url, projectId }) => {
	const testCaseId = url.searchParams.get('testCaseId');
	const testExecutionId = url.searchParams.get('testExecutionId');

	const conditions = [eq(issueLink.projectId, projectId)];

	if (testCaseId) {
		const parsedTestCaseId = parsePositiveInteger(testCaseId, 'testCaseId');
		if (parsedTestCaseId instanceof Response) return parsedTestCaseId;
		if (parsedTestCaseId === undefined) return badRequest('testCaseId must be a positive integer');
		conditions.push(eq(issueLink.testCaseId, parsedTestCaseId));
	}
	if (testExecutionId) {
		const parsedTestExecutionId = parsePositiveInteger(testExecutionId, 'testExecutionId');
		if (parsedTestExecutionId instanceof Response) return parsedTestExecutionId;
		if (parsedTestExecutionId === undefined) {
			return badRequest('testExecutionId must be a positive integer');
		}
		conditions.push(eq(issueLink.testExecutionId, parsedTestExecutionId));
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
		const bodyOrError = validateRequestBody(await parseJsonBody(request));
		if (bodyOrError instanceof Response) return bodyOrError;

		const payloadOrError = validatePayload(bodyOrError);
		if (payloadOrError instanceof Response) return payloadOrError;
		const body = payloadOrError;

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
				externalUrl: body.externalUrl,
				externalKey: body.externalKey ?? null,
				title: body.title ?? null,
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
