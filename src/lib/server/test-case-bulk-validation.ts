import { badRequest } from '$lib/server/errors';
import { isPlainRecord } from './object-validation';

const MAX_BULK_TEST_CASES = 200;
const MAX_PRIORITY_LENGTH = 30;
const MAX_USER_ID_LENGTH = 255;
const BASE_FIELDS = new Set(['action', 'testCaseIds']);
const ACTION_FIELDS: Record<BulkTestCaseAction, Set<string>> = {
	addTag: new Set([...BASE_FIELDS, 'tagId']),
	removeTag: new Set([...BASE_FIELDS, 'tagId']),
	setPriority: new Set([...BASE_FIELDS, 'priority']),
	moveToGroup: new Set([...BASE_FIELDS, 'groupId']),
	delete: BASE_FIELDS,
	clone: BASE_FIELDS,
	addAssignee: new Set([...BASE_FIELDS, 'userId']),
	removeAssignee: new Set([...BASE_FIELDS, 'userId'])
};

const BULK_ACTIONS = [
	'addTag',
	'removeTag',
	'setPriority',
	'moveToGroup',
	'delete',
	'clone',
	'addAssignee',
	'removeAssignee'
] as const;

export type BulkTestCaseAction = (typeof BULK_ACTIONS)[number];

export type ValidatedBulkTestCasePayload = {
	action: BulkTestCaseAction;
	testCaseIds: number[];
	tagId?: number;
	priority?: string;
	groupId?: number | null;
	userId?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return isPlainRecord(value);
}

function validatePositiveInteger(value: unknown, field: string): number | Response {
	if (!Number.isSafeInteger(value) || typeof value !== 'number' || value <= 0) {
		return badRequest(`${field} must be a positive integer`);
	}
	return value;
}

function validateTestCaseIds(value: unknown): number[] | Response {
	if (!Array.isArray(value) || value.length === 0) {
		return badRequest('No test cases specified');
	}
	if (value.length > MAX_BULK_TEST_CASES) {
		return badRequest(`Batch size cannot exceed ${MAX_BULK_TEST_CASES} items`);
	}

	const seen = new Set<number>();
	const ids: number[] = [];
	for (const id of value) {
		const parsed = validatePositiveInteger(id, 'testCaseIds items');
		if (parsed instanceof Response) return parsed;
		if (seen.has(parsed)) {
			return badRequest('testCaseIds must not contain duplicates');
		}
		seen.add(parsed);
		ids.push(parsed);
	}
	return ids;
}

function validateRequiredId(value: unknown, field: string): number | Response {
	if (value === undefined || value === null) {
		return badRequest(`${field} required`);
	}
	return validatePositiveInteger(value, field);
}

function validateRequiredString(
	value: unknown,
	options: { maxLength: number; error: string }
): string | Response {
	if (typeof value !== 'string') {
		return badRequest(options.error);
	}
	const trimmed = value.trim();
	if (!trimmed || trimmed.length > options.maxLength) {
		return badRequest(options.error);
	}
	return trimmed;
}

function validateAllowedFields(
	body: Record<string, unknown>,
	action: BulkTestCaseAction
): Response | null {
	const allowedFields = ACTION_FIELDS[action];
	const unknownFields = Object.keys(body).filter((key) => !allowedFields.has(key));
	if (unknownFields.length > 0) {
		return badRequest(`Unknown field(s): ${unknownFields.join(', ')}`);
	}
	return null;
}

export function validateBulkTestCasePayload(
	body: unknown
): ValidatedBulkTestCasePayload | Response {
	if (!isRecord(body)) {
		return badRequest('Invalid request body');
	}

	const action = body.action;
	if (typeof action !== 'string' || !BULK_ACTIONS.includes(action as BulkTestCaseAction)) {
		return badRequest('Invalid action');
	}
	const bulkAction = action as BulkTestCaseAction;

	const fieldError = validateAllowedFields(body, bulkAction);
	if (fieldError) return fieldError;

	const testCaseIds = validateTestCaseIds(body.testCaseIds);
	if (testCaseIds instanceof Response) return testCaseIds;

	const result: ValidatedBulkTestCasePayload = {
		action: bulkAction,
		testCaseIds
	};

	if (action === 'addTag' || action === 'removeTag') {
		const tagId = validateRequiredId(body.tagId, 'tagId');
		if (tagId instanceof Response) return tagId;
		result.tagId = tagId;
	}

	if (action === 'setPriority') {
		const priority = validateRequiredString(body.priority, {
			maxLength: MAX_PRIORITY_LENGTH,
			error: 'Invalid priority'
		});
		if (priority instanceof Response) return priority;
		result.priority = priority;
	}

	if (action === 'moveToGroup') {
		if (body.groupId === undefined || body.groupId === null) {
			result.groupId = null;
		} else {
			const groupId = validatePositiveInteger(body.groupId, 'groupId');
			if (groupId instanceof Response) return groupId;
			result.groupId = groupId;
		}
	}

	if (action === 'addAssignee' || action === 'removeAssignee') {
		const userId = validateRequiredString(body.userId, {
			maxLength: MAX_USER_ID_LENGTH,
			error: 'userId required'
		});
		if (userId instanceof Response) return userId;
		result.userId = userId;
	}

	return result;
}
