import { badRequest } from './errors';
import { validateRequestBody } from './id-list-validation';

const MAX_ISSUE_LINK_TITLE_LENGTH = 500;
const MAX_ISSUE_LINK_STATUS_LENGTH = 120;
const ISSUE_LINK_UPDATE_FIELDS = new Set(['title', 'status']);

export type IssueLinkUpdates = {
	title?: string | null;
	status?: string | null;
};

export function validateIssueLinkUpdateInput(body: unknown): IssueLinkUpdates | Response {
	const bodyOrError = validateRequestBody(body);
	if (bodyOrError instanceof Response) return bodyOrError;

	if (Object.keys(bodyOrError).some((key) => !ISSUE_LINK_UPDATE_FIELDS.has(key))) {
		return badRequest('Invalid issue link field');
	}

	const updates: IssueLinkUpdates = {};

	if ('title' in bodyOrError) {
		const titleOrError = validateOptionalTextField(
			bodyOrError.title,
			'title',
			MAX_ISSUE_LINK_TITLE_LENGTH
		);
		if (titleOrError instanceof Response) return titleOrError;
		updates.title = titleOrError;
	}

	if ('status' in bodyOrError) {
		const statusOrError = validateOptionalTextField(
			bodyOrError.status,
			'status',
			MAX_ISSUE_LINK_STATUS_LENGTH
		);
		if (statusOrError instanceof Response) return statusOrError;
		updates.status = statusOrError;
	}

	if (Object.keys(updates).length === 0) {
		return badRequest('No fields to update');
	}

	return updates;
}

function validateOptionalTextField(
	value: unknown,
	label: string,
	maxLength: number
): string | null | Response {
	if (value == null) return null;
	if (typeof value !== 'string') {
		return badRequest(`${label} must be a string or null`);
	}
	const text = value.trim();
	if (!text) return null;
	if (text.length > maxLength) {
		return badRequest(`${label} must be ${maxLength} characters or less`);
	}
	return text;
}
