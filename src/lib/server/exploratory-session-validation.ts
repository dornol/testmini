import { badRequest } from '$lib/server/errors';

const MAX_TITLE_LENGTH = 500;
const MAX_TEXT_LENGTH = 10_000;
const MAX_ENVIRONMENT_LENGTH = 255;
const MAX_TAGS = 50;
const MAX_TAG_LENGTH = 100;

const SESSION_ACTIONS = ['pause', 'resume', 'complete'] as const;

export type ExploratorySessionAction = (typeof SESSION_ACTIONS)[number];

export type ValidatedCreateExploratorySession = {
	title: string;
	charter: string | null;
	environment: string | null;
	tags: string[];
};

export type ValidatedUpdateExploratorySession = {
	action?: ExploratorySessionAction;
	summary?: string | null;
	title?: string;
	charter?: string | null;
	environment?: string | null;
	tags?: string[];
	pausedDuration?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateRequiredString(
	value: unknown,
	field: string,
	options: { maxLength: number; emptyMessage?: string }
): string | Response {
	if (typeof value !== 'string') return badRequest(`${field} is required`);
	const trimmed = value.trim();
	if (!trimmed) return badRequest(options.emptyMessage ?? `${field} is required`);
	if (trimmed.length > options.maxLength) {
		return badRequest(`${field} must be ${options.maxLength} characters or less`);
	}
	return trimmed;
}

function validateOptionalString(
	value: unknown,
	field: string,
	options: { maxLength: number }
): string | null | Response {
	if (value === undefined || value === null) return null;
	if (typeof value !== 'string') return badRequest(`${field} must be a string`);
	const trimmed = value.trim();
	if (trimmed.length > options.maxLength) {
		return badRequest(`${field} must be ${options.maxLength} characters or less`);
	}
	return trimmed || null;
}

function validateTags(value: unknown): string[] | Response {
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value)) return badRequest('tags must be an array');
	if (value.length > MAX_TAGS) {
		return badRequest(`tags must contain ${MAX_TAGS} items or less`);
	}

	const tags: string[] = [];
	for (const [index, tag] of value.entries()) {
		if (typeof tag !== 'string') return badRequest(`tags[${index}] must be a string`);
		const trimmed = tag.trim();
		if (!trimmed) return badRequest(`tags[${index}] cannot be empty`);
		if (trimmed.length > MAX_TAG_LENGTH) {
			return badRequest(`tags[${index}] must be ${MAX_TAG_LENGTH} characters or less`);
		}
		tags.push(trimmed);
	}
	return tags;
}

export function validateCreateExploratorySessionPayload(
	body: unknown
): ValidatedCreateExploratorySession | Response {
	if (!isRecord(body)) return badRequest('Request body must be an object');

	const title = validateRequiredString(body.title, 'Title', { maxLength: MAX_TITLE_LENGTH });
	if (title instanceof Response) return title;

	const charter = validateOptionalString(body.charter, 'charter', { maxLength: MAX_TEXT_LENGTH });
	if (charter instanceof Response) return charter;

	const environment = validateOptionalString(body.environment, 'environment', {
		maxLength: MAX_ENVIRONMENT_LENGTH
	});
	if (environment instanceof Response) return environment;

	const tags = validateTags(body.tags);
	if (tags instanceof Response) return tags;

	return { title, charter, environment, tags };
}

export function validateUpdateExploratorySessionPayload(
	body: unknown
): ValidatedUpdateExploratorySession | Response {
	if (!isRecord(body)) return badRequest('Request body must be an object');

	const updates: ValidatedUpdateExploratorySession = {};

	if (body.action !== undefined) {
		if (typeof body.action !== 'string' || !SESSION_ACTIONS.includes(body.action as ExploratorySessionAction)) {
			return badRequest('Invalid action');
		}
		updates.action = body.action as ExploratorySessionAction;
	}

	if (body.summary !== undefined) {
		const summary = validateOptionalString(body.summary, 'summary', { maxLength: MAX_TEXT_LENGTH });
		if (summary instanceof Response) return summary;
		updates.summary = summary;
	}

	if (body.title !== undefined) {
		const title = validateRequiredString(body.title, 'Title', {
			maxLength: MAX_TITLE_LENGTH,
			emptyMessage: 'Title cannot be empty'
		});
		if (title instanceof Response) return title;
		updates.title = title;
	}

	if (body.charter !== undefined) {
		const charter = validateOptionalString(body.charter, 'charter', { maxLength: MAX_TEXT_LENGTH });
		if (charter instanceof Response) return charter;
		updates.charter = charter;
	}

	if (body.environment !== undefined) {
		const environment = validateOptionalString(body.environment, 'environment', {
			maxLength: MAX_ENVIRONMENT_LENGTH
		});
		if (environment instanceof Response) return environment;
		updates.environment = environment;
	}

	if (body.tags !== undefined) {
		const tags = validateTags(body.tags);
		if (tags instanceof Response) return tags;
		updates.tags = tags;
	}

	if (body.pausedDuration !== undefined) {
		if (
			typeof body.pausedDuration !== 'number' ||
			!Number.isSafeInteger(body.pausedDuration) ||
			body.pausedDuration < 0
		) {
			return badRequest('pausedDuration must be a non-negative integer');
		}
		updates.pausedDuration = body.pausedDuration;
	}

	return updates;
}
