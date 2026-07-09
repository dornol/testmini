import { badRequest } from '$lib/server/errors';
import { validateRequestBody } from '$lib/server/id-list-validation';
import type { TestStep } from '$lib/server/db/schema';

const MAX_NAME_LENGTH = 200;
const MAX_TEXT_LENGTH = 10000;
const MAX_PRIORITY_LENGTH = 30;
const MAX_STEPS = 500;

type TemplateInput = {
	name?: string;
	description?: string | null;
	precondition?: string | null;
	steps?: TestStep[];
	priority?: string;
};

type CreateTemplateInput = TemplateInput & { name: string };

export function validateCreateTemplateInput(body: unknown): CreateTemplateInput | Response {
	const recordOrError = validateRequestBody(body);
	if (recordOrError instanceof Response) return recordOrError;

	const name = validateTemplateName(recordOrError.name);
	if (name instanceof Response) return name;

	const commonOrError = validateTemplateCommonFields(recordOrError);
	if (commonOrError instanceof Response) return commonOrError;

	return { ...commonOrError, name };
}

export function validateUpdateTemplateInput(body: unknown): TemplateInput | Response {
	const recordOrError = validateRequestBody(body);
	if (recordOrError instanceof Response) return recordOrError;

	const commonOrError = validateTemplateCommonFields(recordOrError);
	if (commonOrError instanceof Response) return commonOrError;

	const updates = { ...commonOrError };
	if (recordOrError.name !== undefined) {
		const name = validateTemplateName(recordOrError.name);
		if (name instanceof Response) return name;
		updates.name = name;
	}

	return updates;
}

function validateTemplateCommonFields(body: Record<string, unknown>): TemplateInput | Response {
	const result: TemplateInput = {};

	if (body.description !== undefined) {
		const description = validateOptionalText(body.description, 'Description');
		if (description instanceof Response) return description;
		result.description = description;
	}

	if (body.precondition !== undefined) {
		const precondition = validateOptionalText(body.precondition, 'Precondition');
		if (precondition instanceof Response) return precondition;
		result.precondition = precondition;
	}

	if (body.priority !== undefined) {
		const priority = validatePriority(body.priority);
		if (priority instanceof Response) return priority;
		result.priority = priority;
	}

	if (body.steps !== undefined) {
		const steps = validateTemplateSteps(body.steps);
		if (steps instanceof Response) return steps;
		result.steps = steps;
	}

	return result;
}

function validateTemplateName(value: unknown): string | Response {
	if (typeof value !== 'string' || value.trim().length === 0) {
		return badRequest('Template name is required');
	}
	const name = value.trim();
	if (name.length > MAX_NAME_LENGTH) {
		return badRequest(`Template name must be ${MAX_NAME_LENGTH} characters or less`);
	}
	return name;
}

function validateOptionalText(value: unknown, label: string): string | null | Response {
	if (value == null) return null;
	if (typeof value !== 'string') {
		return badRequest(`${label} must be a string`);
	}
	const text = value.trim();
	if (text.length > MAX_TEXT_LENGTH) {
		return badRequest(`${label} must be ${MAX_TEXT_LENGTH} characters or less`);
	}
	return text.length > 0 ? text : null;
}

function validatePriority(value: unknown): string | Response {
	if (typeof value !== 'string' || value.trim().length === 0) {
		return badRequest('Priority must be a non-empty string');
	}
	const priority = value.trim();
	if (priority.length > MAX_PRIORITY_LENGTH) {
		return badRequest(`Priority must be ${MAX_PRIORITY_LENGTH} characters or less`);
	}
	return priority;
}

function validateTemplateSteps(value: unknown): TestStep[] | Response {
	if (!Array.isArray(value)) {
		return badRequest('Steps must be an array');
	}
	if (value.length > MAX_STEPS) {
		return badRequest(`Steps must contain ${MAX_STEPS} items or less`);
	}

	const steps: TestStep[] = [];
	for (const [index, step] of value.entries()) {
		if (!step || typeof step !== 'object' || Array.isArray(step)) {
			return badRequest('Each step must be an object');
		}
		const record = step as Record<string, unknown>;
		if (typeof record.action !== 'string') {
			return badRequest('Step action must be a string');
		}
		if (typeof record.expected !== 'string') {
			return badRequest('Step expected result must be a string');
		}

		const action = record.action.trim();
		const expected = record.expected.trim();
		if (action.length === 0) {
			return badRequest('Step action is required');
		}
		if (expected.length === 0) {
			return badRequest('Step expected result is required');
		}
		if (action.length > MAX_TEXT_LENGTH || expected.length > MAX_TEXT_LENGTH) {
			return badRequest(`Step text must be ${MAX_TEXT_LENGTH} characters or less`);
		}

		steps.push({ order: index + 1, action, expected });
	}

	return steps;
}
