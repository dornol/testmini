import { badRequest } from '$lib/server/errors';

const MAX_REQUIREMENT_TITLE_LENGTH = 255;
const MAX_REQUIREMENT_EXTERNAL_ID_LENGTH = 255;
const MAX_REQUIREMENT_DESCRIPTION_LENGTH = 10_000;
const MAX_REQUIREMENT_SOURCE_LENGTH = 255;
const REQUIREMENT_FIELDS = new Set(['title', 'externalId', 'description', 'source']);

export interface ValidatedRequirementFields {
	title?: string;
	externalId?: string | null;
	description?: string | null;
	source?: string | null;
}

function validateOptionalStringField(
	body: Record<string, unknown>,
	key: keyof ValidatedRequirementFields,
	label: string,
	maxLength: number
): string | null | undefined | Response {
	if (body[key] === undefined) return undefined;
	const value = body[key];
	if (value === null) return null;
	if (typeof value !== 'string') return badRequest(`${label} must be a string`);
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (trimmed.length > maxLength) {
		return badRequest(`${label} must be ${maxLength} characters or less`);
	}
	return trimmed;
}

export function validateRequirementFields(
	body: unknown,
	options: { requireTitle?: boolean } = {}
): ValidatedRequirementFields | Response {
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return badRequest('Invalid request body');
	}

	const input = body as Record<string, unknown>;
	if (Object.keys(input).some((key) => !REQUIREMENT_FIELDS.has(key))) {
		return badRequest('Invalid requirement field');
	}

	const fields: ValidatedRequirementFields = {};

	if (input.title !== undefined) {
		if (typeof input.title !== 'string') return badRequest('Title must be a string');
		const title = input.title.trim();
		if (!title) return badRequest('Title is required');
		if (title.length > MAX_REQUIREMENT_TITLE_LENGTH) {
			return badRequest(`Title must be ${MAX_REQUIREMENT_TITLE_LENGTH} characters or less`);
		}
		fields.title = title;
	} else if (options.requireTitle) {
		return badRequest('Title is required');
	}

	const externalId = validateOptionalStringField(
		input,
		'externalId',
		'External ID',
		MAX_REQUIREMENT_EXTERNAL_ID_LENGTH
	);
	if (externalId instanceof Response) return externalId;
	if (externalId !== undefined) fields.externalId = externalId;

	const description = validateOptionalStringField(
		input,
		'description',
		'Description',
		MAX_REQUIREMENT_DESCRIPTION_LENGTH
	);
	if (description instanceof Response) return description;
	if (description !== undefined) fields.description = description;

	const source = validateOptionalStringField(
		input,
		'source',
		'Source',
		MAX_REQUIREMENT_SOURCE_LENGTH
	);
	if (source instanceof Response) return source;
	if (source !== undefined) fields.source = source;

	return fields;
}
