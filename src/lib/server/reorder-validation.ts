import { badRequest } from '$lib/server/errors';

const MAX_REORDER_ITEMS = 1000;

export type TestCaseReorderItem = {
	id: number;
	groupId: number | null;
	sortOrder: number;
};

export type GroupReorderItem = {
	id: number;
	sortOrder: number;
};

export function validateRequestBody(body: unknown): Record<string, unknown> | Response {
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return badRequest('Invalid request body');
	}
	return body as Record<string, unknown>;
}

function parsePositiveInteger(value: unknown, label: string): number | Response {
	const parsed = typeof value === 'number' ? value : Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		return badRequest(`${label} must be a positive integer`);
	}
	return parsed;
}

function parseSortOrder(value: unknown): number | Response {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
		return badRequest('sortOrder must be a non-negative integer');
	}
	return value;
}

function validateArray(value: unknown, label: string): unknown[] | Response {
	if (!Array.isArray(value)) {
		return badRequest(`${label} array is required`);
	}
	if (value.length > MAX_REORDER_ITEMS) {
		return badRequest(`${label} must contain ${MAX_REORDER_ITEMS} items or less`);
	}
	return value;
}

function validateItemObject(item: unknown, label: string, index: number): Record<string, unknown> | Response {
	if (!item || typeof item !== 'object' || Array.isArray(item)) {
		return badRequest(`${label} ${index + 1} must be an object`);
	}
	return item as Record<string, unknown>;
}

function ensureUniqueId(id: number, seen: Set<number>, label: string): Response | null {
	if (seen.has(id)) {
		return badRequest(`${label} must not contain duplicate ids`);
	}
	seen.add(id);
	return null;
}

export function validateTestCaseReorderItems(value: unknown): TestCaseReorderItem[] | Response {
	const rawItems = validateArray(value, 'items');
	if (rawItems instanceof Response) return rawItems;

	const seen = new Set<number>();
	const items: TestCaseReorderItem[] = [];
	for (let index = 0; index < rawItems.length; index += 1) {
		const item = validateItemObject(rawItems[index], 'items', index);
		if (item instanceof Response) return item;

		const id = parsePositiveInteger(item.id, 'id');
		if (id instanceof Response) return id;
		const duplicate = ensureUniqueId(id, seen, 'items');
		if (duplicate) return duplicate;

		let groupId: number | null = null;
		if (item.groupId !== undefined && item.groupId !== null) {
			const parsedGroupId = parsePositiveInteger(item.groupId, 'groupId');
			if (parsedGroupId instanceof Response) return parsedGroupId;
			groupId = parsedGroupId;
		}

		const sortOrder = parseSortOrder(item.sortOrder);
		if (sortOrder instanceof Response) return sortOrder;

		items.push({ id, groupId, sortOrder });
	}
	return items;
}

export function validateGroupReorderItems(value: unknown): GroupReorderItem[] | Response {
	const rawGroups = validateArray(value, 'groups');
	if (rawGroups instanceof Response) return rawGroups;

	const seen = new Set<number>();
	const groups: GroupReorderItem[] = [];
	for (let index = 0; index < rawGroups.length; index += 1) {
		const group = validateItemObject(rawGroups[index], 'groups', index);
		if (group instanceof Response) return group;

		const id = parsePositiveInteger(group.id, 'id');
		if (id instanceof Response) return id;
		const duplicate = ensureUniqueId(id, seen, 'groups');
		if (duplicate) return duplicate;

		const sortOrder = parseSortOrder(group.sortOrder);
		if (sortOrder instanceof Response) return sortOrder;

		groups.push({ id, sortOrder });
	}
	return groups;
}
