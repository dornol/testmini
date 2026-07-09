import { badRequest } from '$lib/server/errors';
import { validateRequestBody } from '$lib/server/id-list-validation';

export const CUSTOM_FIELD_TYPES = [
	'TEXT',
	'NUMBER',
	'SELECT',
	'MULTISELECT',
	'DATE',
	'CHECKBOX',
	'URL'
] as const;

type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

type CustomFieldInput = {
	name?: string;
	fieldType?: CustomFieldType;
	options?: string[] | null;
	required?: boolean;
	sortOrder?: number;
};

type CreateCustomFieldInput = CustomFieldInput & {
	name: string;
	fieldType: CustomFieldType;
};

const MAX_NAME_LENGTH = 200;
const MAX_OPTIONS = 100;
const MAX_OPTION_LENGTH = 200;
const CREATE_CUSTOM_FIELD_FIELDS = new Set(['name', 'fieldType', 'options', 'required']);
const UPDATE_CUSTOM_FIELD_FIELDS = new Set(['name', 'options', 'required', 'sortOrder']);

export function validateCreateCustomFieldInput(body: unknown): CreateCustomFieldInput | Response {
	const recordOrError = validateRequestBody(body);
	if (recordOrError instanceof Response) return recordOrError;
	const fieldError = validateCustomFieldKeys(recordOrError, CREATE_CUSTOM_FIELD_FIELDS);
	if (fieldError) return fieldError;

	const name = validateCustomFieldName(recordOrError.name, 'Name is required');
	if (name instanceof Response) return name;

	const fieldType = validateFieldType(recordOrError.fieldType);
	if (fieldType instanceof Response) return fieldType;

	const commonOrError = validateCommonCustomFieldInput(recordOrError, fieldType);
	if (commonOrError instanceof Response) return commonOrError;

	return { ...commonOrError, name, fieldType };
}

export function validateUpdateCustomFieldInput(body: unknown): CustomFieldInput | Response {
	const recordOrError = validateRequestBody(body);
	if (recordOrError instanceof Response) return recordOrError;
	const fieldError = validateCustomFieldKeys(recordOrError, UPDATE_CUSTOM_FIELD_FIELDS);
	if (fieldError) return fieldError;

	const updates = validateCommonCustomFieldInput(recordOrError);
	if (updates instanceof Response) return updates;

	if (recordOrError.name !== undefined) {
		const name = validateCustomFieldName(recordOrError.name, 'Name cannot be empty');
		if (name instanceof Response) return name;
		updates.name = name;
	}
	if (Object.keys(updates).length === 0) {
		return badRequest('No fields to update');
	}

	return updates;
}

function validateCustomFieldKeys(
	body: Record<string, unknown>,
	allowedFields: Set<string>
): Response | null {
	if (Object.keys(body).some((key) => !allowedFields.has(key))) {
		return badRequest('Invalid custom field field');
	}
	return null;
}

function validateCommonCustomFieldInput(
	body: Record<string, unknown>,
	fieldType?: CustomFieldType
): CustomFieldInput | Response {
	const input: CustomFieldInput = {};

	if (body.options !== undefined || fieldType === 'SELECT' || fieldType === 'MULTISELECT') {
		const options = validateOptions(body.options, fieldType);
		if (options instanceof Response) return options;
		input.options = options;
	}

	if (body.required !== undefined) {
		if (typeof body.required !== 'boolean') {
			return badRequest('required must be a boolean');
		}
		input.required = body.required;
	}

	if (body.sortOrder !== undefined) {
		const sortOrder = validateNonNegativeInteger(body.sortOrder, 'sortOrder');
		if (sortOrder instanceof Response) return sortOrder;
		input.sortOrder = sortOrder;
	}

	return input;
}

function validateCustomFieldName(value: unknown, emptyMessage: string): string | Response {
	if (typeof value !== 'string' || value.trim().length === 0) {
		return badRequest(emptyMessage);
	}
	const name = value.trim();
	if (name.length > MAX_NAME_LENGTH) {
		return badRequest(`Name must be ${MAX_NAME_LENGTH} characters or less`);
	}
	return name;
}

function validateFieldType(value: unknown): CustomFieldType | Response {
	if (typeof value !== 'string' || !CUSTOM_FIELD_TYPES.includes(value as CustomFieldType)) {
		return badRequest(`Invalid field type. Must be one of: ${CUSTOM_FIELD_TYPES.join(', ')}`);
	}
	return value as CustomFieldType;
}

function validateOptions(value: unknown, fieldType?: CustomFieldType): string[] | null | Response {
	if (value == null) {
		if (fieldType === 'SELECT' || fieldType === 'MULTISELECT') {
			return badRequest('Options are required for SELECT/MULTISELECT fields');
		}
		return null;
	}
	if (!Array.isArray(value)) {
		return badRequest('Options must be an array');
	}
	if (value.length > MAX_OPTIONS) {
		return badRequest(`Options must contain ${MAX_OPTIONS} items or less`);
	}

	const options: string[] = [];
	const seen = new Set<string>();
	for (const option of value) {
		if (typeof option !== 'string' || option.trim().length === 0) {
			return badRequest('Options must contain non-empty strings');
		}
		const trimmed = option.trim();
		if (trimmed.length > MAX_OPTION_LENGTH) {
			return badRequest(`Options must be ${MAX_OPTION_LENGTH} characters or less`);
		}
		const key = trimmed.toLowerCase();
		if (seen.has(key)) {
			return badRequest('Options must not contain duplicates');
		}
		seen.add(key);
		options.push(trimmed);
	}

	if ((fieldType === 'SELECT' || fieldType === 'MULTISELECT') && options.length === 0) {
		return badRequest('Options are required for SELECT/MULTISELECT fields');
	}

	return options;
}

function validateNonNegativeInteger(value: unknown, label: string): number | Response {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
		return badRequest(`${label} must be a non-negative integer`);
	}
	return value;
}
