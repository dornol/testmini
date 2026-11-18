import { badRequest } from '$lib/server/errors';
import { isPlainRecord } from './object-validation';

import { REQUIREMENT_LIMITS } from '$lib/requirement-limits';

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
	if (!isPlainRecord(body)) {
		return badRequest('Invalid request body');
	}

	if (Object.keys(body).some((key) => !REQUIREMENT_FIELDS.has(key))) {
		return badRequest('Invalid requirement field');
	}

	const fields: ValidatedRequirementFields = {};

	if (body.title !== undefined) {
		if (typeof body.title !== 'string') return badRequest('Title must be a string');
		const title = body.title.trim();
		if (!title) return badRequest('Title is required');
		if (title.length > REQUIREMENT_LIMITS.title) {
			return badRequest(`Title must be ${REQUIREMENT_LIMITS.title} characters or less`);
		}
		fields.title = title;
	} else if (options.requireTitle) {
		return badRequest('Title is required');
	}

	const externalId = validateOptionalStringField(
		body,
		'externalId',
		'External ID',
		REQUIREMENT_LIMITS.externalId
	);
	if (externalId instanceof Response) return externalId;
	if (externalId !== undefined) fields.externalId = externalId;

	const description = validateOptionalStringField(
		body,
		'description',
		'Description',
		REQUIREMENT_LIMITS.description
	);
	if (description instanceof Response) return description;
	if (description !== undefined) fields.description = description;

	const source = validateOptionalStringField(body, 'source', 'Source', REQUIREMENT_LIMITS.source);
	if (source instanceof Response) return source;
	if (source !== undefined) fields.source = source;

	return fields;
}
