import { badRequest } from './errors';
import { isPlainRecord } from './object-validation';
import { parseCanonicalPositiveInteger } from './search-param-validation';

const MAX_EXTERNAL_URL_LENGTH = 2000;
const MAX_EXTERNAL_KEY_LENGTH = 128;
const MAX_TITLE_LENGTH = 500;
const MAX_PROVIDER_LENGTH = 120;
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/;
const ISSUE_LINK_CREATE_FIELDS = new Set([
	'testCaseId',
	'testExecutionId',
	'externalUrl',
	'externalKey',
	'title'
]);

export type IssueLinkCreateInput = {
	testCaseId?: number;
	testExecutionId?: number;
	externalUrl: string;
	externalKey?: string | null;
	title?: string | null;
};

export function validateIssueLinkRequestBody(body: unknown): Record<string, unknown> | Response {
	if (!isPlainRecord(body)) {
		return badRequest('Invalid request body');
	}
	return body;
}

export function parseIssueLinkPositiveInteger(
	value: unknown,
	label: string
): number | undefined | Response {
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

export function validateIssueLinkCreateInput(
	body: Record<string, unknown>
): IssueLinkCreateInput | Response {
	if (Object.keys(body).some((key) => !ISSUE_LINK_CREATE_FIELDS.has(key))) {
		return badRequest('Invalid issue link field');
	}

	const testCaseId = parseIssueLinkPositiveInteger(body.testCaseId, 'testCaseId');
	if (testCaseId instanceof Response) return testCaseId;

	const testExecutionId = parseIssueLinkPositiveInteger(body.testExecutionId, 'testExecutionId');
	if (testExecutionId instanceof Response) return testExecutionId;

	if (!testCaseId && !testExecutionId) {
		return badRequest('Either testCaseId or testExecutionId is required');
	}

	const externalUrl = validateExternalUrl(body.externalUrl);
	if (externalUrl instanceof Response) return externalUrl;

	const externalKey = validateIssueLinkOptionalText(
		body.externalKey,
		'External key',
		MAX_EXTERNAL_KEY_LENGTH
	);
	if (externalKey instanceof Response) return externalKey;

	const title = validateIssueLinkOptionalText(body.title, 'Title', MAX_TITLE_LENGTH);
	if (title instanceof Response) return title;

	return { testCaseId, testExecutionId, externalUrl, externalKey, title };
}

export function validateIssueLinkProvider(value: unknown): string | Response {
	if (typeof value !== 'string') return badRequest('Provider is required');
	const provider = value.trim();
	if (!provider) return badRequest('Provider is required');
	if (provider.length > MAX_PROVIDER_LENGTH) {
		return badRequest(`Provider must be ${MAX_PROVIDER_LENGTH} characters or less`);
	}
	if (CONTROL_CHAR_PATTERN.test(provider)) {
		return badRequest('Provider contains invalid characters');
	}
	return provider;
}

function validateIssueLinkOptionalText(
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
	if (CONTROL_CHAR_PATTERN.test(trimmed)) {
		return badRequest(`${label} contains invalid characters`);
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
	if (CONTROL_CHAR_PATTERN.test(externalUrl)) {
		return badRequest('External URL contains invalid characters');
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
