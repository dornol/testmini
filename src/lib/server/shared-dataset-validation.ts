import { badRequest } from '$lib/server/errors';

const MAX_NAME_LENGTH = 100;
const MAX_PARAMETER_COUNT = 100;
const MAX_PARAMETER_LENGTH = 100;
const MAX_ROW_COUNT = 1000;
const MAX_ROW_VALUE_LENGTH = 5000;
const MAX_ROWS_JSON_LENGTH = 200000;
const UNSAFE_DATASET_PARAMETER_NAMES = new Set(['__proto__', 'constructor', 'prototype']);
export const SHARED_DATASET_FIELDS = new Set(['name', 'parameters', 'rows']);
export const SHARED_DATASET_LINK_FIELDS = new Set(['testCaseId']);

export function validateRequestBody(body: unknown): Record<string, unknown> | Response {
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return badRequest('Invalid request body');
	}
	return body as Record<string, unknown>;
}

export function validateRequestFields(
	body: Record<string, unknown>,
	allowedFields: Set<string>
): Response | null {
	if (Object.keys(body).some((key) => !allowedFields.has(key))) {
		return badRequest('Invalid shared data set field');
	}
	return null;
}

export function validateDataSetName(value: unknown): string | Response {
	if (typeof value !== 'string') {
		return badRequest('Name is required');
	}
	const name = value.trim();
	if (!name) return badRequest('Name is required');
	if (name.length > MAX_NAME_LENGTH) {
		return badRequest(`Name must be ${MAX_NAME_LENGTH} characters or less`);
	}
	return name;
}

export function validateDataSetParameters(value: unknown): string[] | Response {
	if (!Array.isArray(value) || value.length === 0) {
		return badRequest('At least one parameter is required');
	}
	if (value.length > MAX_PARAMETER_COUNT) {
		return badRequest(`Parameters must contain ${MAX_PARAMETER_COUNT} items or less`);
	}

	const parameters: string[] = [];
	const seen = new Set<string>();
	for (const parameter of value) {
		if (typeof parameter !== 'string') {
			return badRequest('Parameters must be strings');
		}
		const trimmed = parameter.trim();
		if (!trimmed) return badRequest('Parameters must not be empty');
		if (trimmed.length > MAX_PARAMETER_LENGTH) {
			return badRequest(`Parameters must be ${MAX_PARAMETER_LENGTH} characters or less`);
		}
		if (UNSAFE_DATASET_PARAMETER_NAMES.has(trimmed)) {
			return badRequest('Parameters contain an unsafe name');
		}
		if (seen.has(trimmed)) return badRequest('Parameters must be unique');
		seen.add(trimmed);
		parameters.push(trimmed);
	}

	return parameters;
}

export function validateDataSetRows(
	value: unknown,
	parameters: readonly string[]
): Record<string, string>[] | Response {
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value)) {
		return badRequest('Rows must be an array');
	}
	if (value.length > MAX_ROW_COUNT) {
		return badRequest(`Rows must contain ${MAX_ROW_COUNT} items or less`);
	}
	if (JSON.stringify(value).length > MAX_ROWS_JSON_LENGTH) {
		return badRequest('Rows payload is too large');
	}

	const parameterSet = new Set(parameters);
	const rows: Record<string, string>[] = [];
	for (let index = 0; index < value.length; index += 1) {
		const row = value[index];
		if (!row || typeof row !== 'object' || Array.isArray(row)) {
			return badRequest(`Row ${index + 1} must be an object`);
		}
		const sanitized: Record<string, string> = {};
		for (const [key, rowValue] of Object.entries(row)) {
			if (!parameterSet.has(key)) {
				return badRequest(`Row ${index + 1} contains unknown parameter "${key}"`);
			}
			if (typeof rowValue !== 'string') {
				return badRequest(`Row ${index + 1} values must be strings`);
			}
			if (rowValue.length > MAX_ROW_VALUE_LENGTH) {
				return badRequest(
					`Row ${index + 1} values must be ${MAX_ROW_VALUE_LENGTH} characters or less`
				);
			}
			sanitized[key] = rowValue;
		}
		rows.push(sanitized);
	}

	return rows;
}
