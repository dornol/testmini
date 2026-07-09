import { badRequest } from './errors';
import { validateRequestBody } from './id-list-validation';

const STATIC_COLUMN_IDS = new Set([
	'key',
	'title',
	'priority',
	'status',
	'tags',
	'assignee',
	'assignees',
	'updatedBy'
]);
const DYNAMIC_COLUMN_PATTERN = /^(cf|run)_[1-9]\d*$/;
const MAX_COLUMN_SETTINGS = 200;

export type ColumnSetting = {
	id: string;
	visible: boolean;
};

export function validateColumnSettingsInput(body: unknown): ColumnSetting[] | Response {
	const bodyOrError = validateRequestBody(body);
	if (bodyOrError instanceof Response) return bodyOrError;

	const { columnSettings } = bodyOrError;
	if (!Array.isArray(columnSettings)) {
		return badRequest('columnSettings must be an array');
	}
	if (columnSettings.length > MAX_COLUMN_SETTINGS) {
		return badRequest(`columnSettings must contain ${MAX_COLUMN_SETTINGS} items or less`);
	}

	const seen = new Set<string>();
	const settings: ColumnSetting[] = [];
	for (const column of columnSettings) {
		const columnOrError = validateColumnSetting(column);
		if (columnOrError instanceof Response) return columnOrError;
		if (seen.has(columnOrError.id)) {
			return badRequest(`Duplicate column id: ${columnOrError.id}`);
		}
		seen.add(columnOrError.id);
		settings.push(columnOrError);
	}

	return settings;
}

function validateColumnSetting(value: unknown): ColumnSetting | Response {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return badRequest('Each column must be an object');
	}

	const column = value as Record<string, unknown>;
	if (typeof column.id !== 'string' || typeof column.visible !== 'boolean') {
		return badRequest('Each column must have id (string) and visible (boolean)');
	}
	if (!isAllowedColumnId(column.id)) {
		return badRequest('Invalid column id');
	}

	return { id: column.id, visible: column.visible };
}

function isAllowedColumnId(id: string): boolean {
	return STATIC_COLUMN_IDS.has(id) || DYNAMIC_COLUMN_PATTERN.test(id);
}
