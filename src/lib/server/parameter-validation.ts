import { badRequest } from '$lib/server/errors';
import { validateRequestBody } from '$lib/server/id-list-validation';

const MAX_PARAMETER_NAME_LENGTH = 200;

type ParameterInput = {
	name?: string;
	orderIndex?: number;
};

type CreateParameterInput = ParameterInput & { name: string };

export function validateCreateParameterInput(body: unknown): CreateParameterInput | Response {
	const recordOrError = validateRequestBody(body);
	if (recordOrError instanceof Response) return recordOrError;

	const name = validateParameterName(recordOrError.name, 'Parameter name is required');
	if (name instanceof Response) return name;

	return { name };
}

export function validateUpdateParameterInput(body: unknown): ParameterInput | Response {
	const recordOrError = validateRequestBody(body);
	if (recordOrError instanceof Response) return recordOrError;

	const input: ParameterInput = {};
	if (recordOrError.name !== undefined) {
		const name = validateParameterName(recordOrError.name, 'Parameter name cannot be empty');
		if (name instanceof Response) return name;
		input.name = name;
	}

	if (recordOrError.orderIndex !== undefined) {
		const orderIndex = validateNonNegativeInteger(recordOrError.orderIndex, 'orderIndex');
		if (orderIndex instanceof Response) return orderIndex;
		input.orderIndex = orderIndex;
	}

	return input;
}

function validateParameterName(value: unknown, emptyMessage: string): string | Response {
	if (typeof value !== 'string' || value.trim().length === 0) {
		return badRequest(emptyMessage);
	}
	const name = value.trim();
	if (name.length > MAX_PARAMETER_NAME_LENGTH) {
		return badRequest(`Parameter name must be ${MAX_PARAMETER_NAME_LENGTH} characters or less`);
	}
	return name;
}

function validateNonNegativeInteger(value: unknown, label: string): number | Response {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
		return badRequest(`${label} must be a non-negative integer`);
	}
	return value;
}
