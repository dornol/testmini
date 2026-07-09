import { badRequest } from './errors';
import { validateRequestBody } from './id-list-validation';
import { isPlainRecord } from './object-validation';

const MAX_DATASET_NAME_LENGTH = 120;
const MAX_DATASET_VALUE_COUNT = 200;
const MAX_DATASET_KEY_LENGTH = 120;
const MAX_DATASET_VALUE_LENGTH = 5000;
const UNSAFE_DATASET_VALUE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/;
const CREATE_DATASET_FIELDS = new Set(['name', 'values']);
const UPDATE_DATASET_FIELDS = new Set(['name', 'values', 'orderIndex']);

type CreateDataSetInput = {
	name: string | null;
	values: Record<string, string>;
};

type UpdateDataSetInput = {
	name?: string | null;
	values?: Record<string, string>;
	orderIndex?: number;
};

export function validateCreateTestCaseDataSetInput(body: unknown): CreateDataSetInput | Response {
	const bodyOrError = validateRequestBody(body);
	if (bodyOrError instanceof Response) return bodyOrError;
	const fieldError = validateDataSetKeys(bodyOrError, CREATE_DATASET_FIELDS);
	if (fieldError) return fieldError;

	const nameOrError = validateDataSetName(bodyOrError.name);
	if (nameOrError instanceof Response) return nameOrError;

	const valuesOrError = validateDataSetValues(bodyOrError.values);
	if (valuesOrError instanceof Response) return valuesOrError;

	return {
		name: nameOrError,
		values: valuesOrError
	};
}

export function validateUpdateTestCaseDataSetInput(body: unknown): UpdateDataSetInput | Response {
	const bodyOrError = validateRequestBody(body);
	if (bodyOrError instanceof Response) return bodyOrError;
	const fieldError = validateDataSetKeys(bodyOrError, UPDATE_DATASET_FIELDS);
	if (fieldError) return fieldError;

	const updates: UpdateDataSetInput = {};

	if ('name' in bodyOrError) {
		const nameOrError = validateDataSetName(bodyOrError.name);
		if (nameOrError instanceof Response) return nameOrError;
		updates.name = nameOrError;
	}

	if ('values' in bodyOrError) {
		const valuesOrError = validateDataSetValues(bodyOrError.values);
		if (valuesOrError instanceof Response) return valuesOrError;
		updates.values = valuesOrError;
	}

	if ('orderIndex' in bodyOrError) {
		const orderIndexOrError = validateOrderIndex(bodyOrError.orderIndex);
		if (orderIndexOrError instanceof Response) return orderIndexOrError;
		updates.orderIndex = orderIndexOrError;
	}
	if (Object.keys(updates).length === 0) {
		return badRequest('No fields to update');
	}

	return updates;
}

function validateDataSetKeys(
	body: Record<string, unknown>,
	allowedFields: Set<string>
): Response | null {
	if (Object.keys(body).some((key) => !allowedFields.has(key))) {
		return badRequest('Invalid data set field');
	}
	return null;
}

function validateDataSetName(value: unknown): string | null | Response {
	if (value == null) return null;
	if (typeof value !== 'string') {
		return badRequest('name must be a string or null');
	}
	const name = value.trim();
	if (!name) return null;
	if (CONTROL_CHAR_PATTERN.test(name)) {
		return badRequest('name must not contain control characters');
	}
	if (name.length > MAX_DATASET_NAME_LENGTH) {
		return badRequest(`name must be ${MAX_DATASET_NAME_LENGTH} characters or less`);
	}
	return name;
}

function validateDataSetValues(value: unknown): Record<string, string> | Response {
	if (!isPlainRecord(value)) {
		return badRequest('values must be an object');
	}

	const entries = Object.entries(value);
	if (entries.length > MAX_DATASET_VALUE_COUNT) {
		return badRequest(`values must contain ${MAX_DATASET_VALUE_COUNT} items or less`);
	}

	const values: Record<string, string> = {};
	for (const [key, entryValue] of entries) {
		if (!key || key.length > MAX_DATASET_KEY_LENGTH) {
			return badRequest(`values keys must be ${MAX_DATASET_KEY_LENGTH} characters or less`);
		}
		if (CONTROL_CHAR_PATTERN.test(key)) {
			return badRequest('values keys must not contain control characters');
		}
		if (UNSAFE_DATASET_VALUE_KEYS.has(key)) {
			return badRequest('values contains an unsafe key');
		}
		if (typeof entryValue !== 'string') {
			return badRequest('values must contain only string values');
		}
		if (entryValue.length > MAX_DATASET_VALUE_LENGTH) {
			return badRequest(`values entries must be ${MAX_DATASET_VALUE_LENGTH} characters or less`);
		}
		values[key] = entryValue;
	}

	return values;
}

function validateOrderIndex(value: unknown): number | Response {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
		return badRequest('orderIndex must be a non-negative integer');
	}
	return value;
}
