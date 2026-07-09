import { badRequest } from '$lib/server/errors';
import { validatePositiveIntegerList, validateRequestBody } from './id-list-validation';

const DEFAULT_RETEST_RUN_NAME = 'Retest Run';
const DEFAULT_RETEST_RUN_ENVIRONMENT = 'QA';
const MAX_TEST_RUN_NAME_LENGTH = 200;
const MAX_TEST_RUN_ENVIRONMENT_LENGTH = 30;
const MAX_RETEST_CASES = 500;

export type RetestRunPayload = {
	name: string;
	environment: string;
	testCaseIds?: number[];
};

function validateOptionalText(
	value: unknown,
	field: string,
	defaultValue: string,
	maxLength: number
): string | Response {
	if (value === undefined || value === null) return defaultValue;
	if (typeof value !== 'string') return badRequest(`${field} must be a string`);

	const trimmed = value.trim();
	if (!trimmed) return defaultValue;
	if (trimmed.length > maxLength) {
		return badRequest(`${field} must be ${maxLength} characters or less`);
	}
	return trimmed;
}

export function validateRetestRunPayload(body: unknown): RetestRunPayload | Response {
	const recordOrError = validateRequestBody(body);
	if (recordOrError instanceof Response) return recordOrError;

	const name = validateOptionalText(
		recordOrError.name,
		'name',
		DEFAULT_RETEST_RUN_NAME,
		MAX_TEST_RUN_NAME_LENGTH
	);
	if (name instanceof Response) return name;

	const environment = validateOptionalText(
		recordOrError.environment,
		'environment',
		DEFAULT_RETEST_RUN_ENVIRONMENT,
		MAX_TEST_RUN_ENVIRONMENT_LENGTH
	);
	if (environment instanceof Response) return environment;

	if (recordOrError.testCaseIds === undefined) {
		return { name, environment };
	}

	const testCaseIds = validatePositiveIntegerList(recordOrError.testCaseIds, 'testCaseIds', {
		maxItems: MAX_RETEST_CASES
	});
	if (testCaseIds instanceof Response) return testCaseIds;

	return { name, environment, testCaseIds };
}
