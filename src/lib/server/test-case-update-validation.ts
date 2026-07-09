import { badRequest } from './errors';

const MAX_TITLE_LENGTH = 200;
const MAX_TEXT_LENGTH = 2000;
const MAX_PRIORITY_LENGTH = 30;
const MAX_AUTOMATION_KEY_LENGTH = 200;
const MAX_KEY_LENGTH = 100;
const MAX_STEPS = 500;
const MAX_CUSTOM_FIELD_ENTRIES = 100;
const MAX_CUSTOM_FIELD_VALUE_LENGTH = 2000;
const MAX_CUSTOM_FIELDS_JSON_LENGTH = 20_000;

type JsonRecord = Record<string, unknown>;

export type ValidatedTestCasePatch = {
	key?: string;
	title?: string;
	priority?: string;
	automationKey?: string | null;
	customFields?: Record<string, unknown>;
};

export type ValidatedTestCasePut = {
	title: string;
	precondition: string | null;
	steps: { order: number; action: string; expected: string }[];
	expectedResult: string | null;
	priority: string;
	revision: number;
	stepFormat?: 'STEPS' | 'GHERKIN';
};

export type ValidatedTestCaseVersionFields = {
	title?: string;
	precondition?: string | null;
	steps?: { order: number; action: string; expected: string }[];
	expectedResult?: string | null;
	priority?: string;
};

export type ValidatedTestCaseCreatePayload = Required<ValidatedTestCaseVersionFields>;

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateStringField(
	value: unknown,
	field: string,
	options: { required?: boolean; maxLength: number; allowEmpty?: boolean }
): string | null | Response {
	if (value === undefined) {
		return options.required ? badRequest(`${field} is required`) : null;
	}
	if (typeof value !== 'string') {
		return badRequest(`${field} must be a string`);
	}

	const trimmed = value.trim();
	if (!options.allowEmpty && trimmed.length < 1) {
		return badRequest(`${field} cannot be empty`);
	}
	if (trimmed.length > options.maxLength) {
		return badRequest(`${field} must be ${options.maxLength} characters or less`);
	}

	return trimmed;
}

function validateNullableText(value: unknown, field: string): string | null | Response {
	if (value === undefined || value === null) return null;
	if (typeof value !== 'string') {
		return badRequest(`${field} must be a string`);
	}
	if (value.length > MAX_TEXT_LENGTH) {
		return badRequest(`${field} must be ${MAX_TEXT_LENGTH} characters or less`);
	}
	return value || null;
}

function validateCustomFields(value: unknown): Record<string, unknown> | Response {
	if (!isRecord(value)) {
		return badRequest('customFields must be an object');
	}

	const entries = Object.entries(value);
	if (entries.length > MAX_CUSTOM_FIELD_ENTRIES) {
		return badRequest(`customFields must contain ${MAX_CUSTOM_FIELD_ENTRIES} entries or fewer`);
	}

	for (const [key, fieldValue] of entries) {
		if (!key.trim()) {
			return badRequest('customFields keys cannot be empty');
		}

		if (fieldValue === null) continue;
		if (
			typeof fieldValue !== 'string' &&
			typeof fieldValue !== 'number' &&
			typeof fieldValue !== 'boolean'
		) {
			return badRequest('customFields values must be strings, numbers, booleans, or null');
		}

		if (typeof fieldValue === 'number' && !Number.isFinite(fieldValue)) {
			return badRequest('customFields number values must be finite');
		}

		if (typeof fieldValue === 'string' && fieldValue.length > MAX_CUSTOM_FIELD_VALUE_LENGTH) {
			return badRequest(
				`customFields string values must be ${MAX_CUSTOM_FIELD_VALUE_LENGTH} characters or less`
			);
		}
	}

	if (JSON.stringify(value).length > MAX_CUSTOM_FIELDS_JSON_LENGTH) {
		return badRequest(`customFields must be ${MAX_CUSTOM_FIELDS_JSON_LENGTH} characters or less`);
	}

	return value;
}

export function validateTestCasePatchPayload(body: unknown): ValidatedTestCasePatch | Response {
	if (!isRecord(body)) {
		return badRequest('Request body must be an object');
	}

	const result: ValidatedTestCasePatch = {};

	if (body.key !== undefined) {
		const key = validateStringField(body.key, 'Key', { maxLength: MAX_KEY_LENGTH });
		if (key instanceof Response) return key;
		if (key === null) return badRequest('Key is required');
		result.key = key;
	}

	if (body.title !== undefined) {
		const title = validateStringField(body.title, 'Title', { maxLength: MAX_TITLE_LENGTH });
		if (title instanceof Response) return title;
		if (title === null) return badRequest('Title is required');
		result.title = title;
	}

	if (body.priority !== undefined) {
		const priority = validateStringField(body.priority, 'Priority', {
			maxLength: MAX_PRIORITY_LENGTH
		});
		if (priority instanceof Response) return priority;
		if (priority === null) return badRequest('Priority is required');
		result.priority = priority;
	}

	if (body.automationKey !== undefined) {
		if (body.automationKey === null) {
			result.automationKey = null;
		} else {
			const automationKey = validateStringField(body.automationKey, 'Automation key', {
				maxLength: MAX_AUTOMATION_KEY_LENGTH,
				allowEmpty: true
			});
			if (automationKey instanceof Response) return automationKey;
			result.automationKey = automationKey || null;
		}
	}

	if (body.customFields !== undefined) {
		const customFields = validateCustomFields(body.customFields);
		if (customFields instanceof Response) return customFields;
		result.customFields = customFields;
	}

	return result;
}

export function validateTestCaseCreatePayload(
	body: unknown
): ValidatedTestCaseCreatePayload | Response {
	const fields = validateTestCaseVersionFields(body, { requireTitle: true, defaultPriority: true });
	if (fields instanceof Response) return fields;

	return {
		title: fields.title!,
		precondition: fields.precondition ?? null,
		steps: fields.steps ?? [],
		expectedResult: fields.expectedResult ?? null,
		priority: fields.priority ?? 'MEDIUM'
	};
}

export function validateTestCaseVersionFields(
	body: unknown,
	options: { requireTitle?: boolean; defaultPriority?: boolean } = {}
): ValidatedTestCaseVersionFields | Response {
	if (!isRecord(body)) {
		return badRequest('Request body must be an object');
	}

	const fields: ValidatedTestCaseVersionFields = {};

	if (options.requireTitle || body.title !== undefined) {
		const title = validateStringField(body.title, 'Title', {
			required: options.requireTitle,
			maxLength: MAX_TITLE_LENGTH
		});
		if (title instanceof Response || title === null) {
			return title instanceof Response ? title : badRequest('Title is required');
		}
		fields.title = title;
	}

	if (options.defaultPriority || body.priority !== undefined) {
		const priority = validateStringField(body.priority ?? 'MEDIUM', 'Priority', {
			required: true,
			maxLength: MAX_PRIORITY_LENGTH
		});
		if (priority instanceof Response || priority === null) {
			return priority instanceof Response ? priority : badRequest('Priority is required');
		}
		fields.priority = priority;
	}

	if (body.steps !== undefined) {
		const steps = validateTestCaseSteps(body.steps);
		if (steps instanceof Response) return steps;
		fields.steps = steps;
	}

	if (body.precondition !== undefined) {
		const precondition = validateNullableText(body.precondition, 'precondition');
		if (precondition instanceof Response) return precondition;
		fields.precondition = precondition;
	}

	if (body.expectedResult !== undefined) {
		const expectedResult = validateNullableText(body.expectedResult, 'expectedResult');
		if (expectedResult instanceof Response) return expectedResult;
		fields.expectedResult = expectedResult;
	}

	return fields;
}

export function validateTestCasePutPayload(body: unknown): ValidatedTestCasePut | Response {
	if (!isRecord(body)) {
		return badRequest('Request body must be an object');
	}

	const title = validateStringField(body.title, 'Title', {
		required: true,
		maxLength: MAX_TITLE_LENGTH
	});
	if (title instanceof Response || title === null) {
		return title instanceof Response ? title : badRequest('Title is required');
	}

	const priority = validateStringField(body.priority, 'Priority', {
		required: true,
		maxLength: MAX_PRIORITY_LENGTH
	});
	if (priority instanceof Response || priority === null) {
		return priority instanceof Response ? priority : badRequest('Priority is required');
	}

	const revision = body.revision;
	if (!Number.isSafeInteger(revision) || typeof revision !== 'number' || revision < 0) {
		return badRequest('Revision must be a non-negative integer');
	}

	if (
		body.stepFormat !== undefined &&
		body.stepFormat !== 'STEPS' &&
		body.stepFormat !== 'GHERKIN'
	) {
		return badRequest('stepFormat must be STEPS or GHERKIN');
	}

	if (body.steps !== undefined && !Array.isArray(body.steps)) {
		return badRequest('steps must be an array');
	}

	const rawSteps = body.steps === undefined ? [] : body.steps;
	const steps = validateTestCaseSteps(rawSteps);
	if (steps instanceof Response) return steps;

	const precondition = validateNullableText(body.precondition, 'precondition');
	if (precondition instanceof Response) return precondition;

	const expectedResult = validateNullableText(body.expectedResult, 'expectedResult');
	if (expectedResult instanceof Response) return expectedResult;

	return {
		title,
		precondition,
		steps,
		expectedResult,
		priority,
		revision,
		stepFormat: body.stepFormat
	};
}

function validateTestCaseSteps(value: unknown): ValidatedTestCasePut['steps'] | Response {
	if (!Array.isArray(value)) {
		return badRequest('steps must be an array');
	}
	const rawSteps = value;
	if (rawSteps.length > MAX_STEPS) {
		return badRequest(`steps must contain ${MAX_STEPS} items or less`);
	}

	const steps: ValidatedTestCasePut['steps'] = [];
	for (const [index, step] of rawSteps.entries()) {
		if (!isRecord(step)) {
			return badRequest(`steps[${index}] must be an object`);
		}

		const action = validateStringField(step.action, `steps[${index}].action`, {
			required: true,
			maxLength: MAX_TEXT_LENGTH
		});
		if (action instanceof Response || action === null) {
			return action instanceof Response ? action : badRequest(`steps[${index}].action is required`);
		}

		const expected = validateStringField(step.expected ?? '', `steps[${index}].expected`, {
			maxLength: MAX_TEXT_LENGTH,
			allowEmpty: true
		});
		if (expected instanceof Response) return expected;

		steps.push({ order: index + 1, action, expected: expected ?? '' });
	}

	return steps;
}
