export const CUSTOM_FIELD_TYPES = [
	'TEXT',
	'NUMBER',
	'SELECT',
	'MULTISELECT',
	'DATE',
	'CHECKBOX',
	'URL'
] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const CUSTOM_FIELD_NAME_LIMIT = 200;
export const CUSTOM_FIELD_OPTION_LIMIT = 100;
export const CUSTOM_FIELD_OPTION_LENGTH_LIMIT = 200;

export function requiresCustomFieldOptions(type?: string): boolean {
	return type === 'SELECT' || type === 'MULTISELECT';
}
