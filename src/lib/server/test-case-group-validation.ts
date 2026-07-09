import { badRequest } from './errors';
import { validateRequestBody } from './id-list-validation';

const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const MAX_GROUP_NAME_LENGTH = 120;
const GROUP_FIELDS = new Set(['name', 'color']);

type CreateGroupInput = {
	name: string;
	color: string | null;
};

type UpdateGroupInput = {
	name?: string;
	color?: string | null;
};

export function validateCreateTestCaseGroupInput(body: unknown): CreateGroupInput | Response {
	const bodyOrError = validateRequestBody(body);
	if (bodyOrError instanceof Response) return bodyOrError;
	const fieldError = validateGroupKeys(bodyOrError);
	if (fieldError) return fieldError;

	const nameOrError = validateGroupName(bodyOrError.name, { required: true });
	if (nameOrError instanceof Response) return nameOrError;

	const colorOrError = validateGroupColor(bodyOrError.color);
	if (colorOrError instanceof Response) return colorOrError;

	return {
		name: nameOrError,
		color: colorOrError ?? null
	};
}

export function validateUpdateTestCaseGroupInput(body: unknown): UpdateGroupInput | Response {
	const bodyOrError = validateRequestBody(body);
	if (bodyOrError instanceof Response) return bodyOrError;
	const fieldError = validateGroupKeys(bodyOrError);
	if (fieldError) return fieldError;

	const updates: UpdateGroupInput = {};

	if ('name' in bodyOrError) {
		const nameOrError = validateGroupName(bodyOrError.name, { required: false });
		if (nameOrError instanceof Response) return nameOrError;
		updates.name = nameOrError;
	}

	if ('color' in bodyOrError) {
		const colorOrError = validateGroupColor(bodyOrError.color);
		if (colorOrError instanceof Response) return colorOrError;
		updates.color = colorOrError ?? null;
	}
	if (Object.keys(updates).length === 0) {
		return badRequest('No fields to update');
	}

	return updates;
}

function validateGroupKeys(body: Record<string, unknown>): Response | null {
	if (Object.keys(body).some((key) => !GROUP_FIELDS.has(key))) {
		return badRequest('Invalid group field');
	}
	return null;
}

function validateGroupName(value: unknown, options: { required: boolean }): string | Response {
	if (typeof value !== 'string') {
		return badRequest(options.required ? 'Name is required' : 'Name must be a string');
	}
	const name = value.trim();
	if (!name) {
		return badRequest(options.required ? 'Name is required' : 'Name cannot be empty');
	}
	if (name.length > MAX_GROUP_NAME_LENGTH) {
		return badRequest(`Name must be ${MAX_GROUP_NAME_LENGTH} characters or less`);
	}
	return name;
}

function validateGroupColor(value: unknown): string | null | Response {
	if (value == null) return null;
	if (typeof value !== 'string') {
		return badRequest('Color must be a string or null');
	}
	if (!HEX_COLOR_PATTERN.test(value)) {
		return badRequest('Invalid HEX color format');
	}
	return value;
}
