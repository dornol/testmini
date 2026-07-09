import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { ZodType } from 'zod';
import { parseCanonicalPositiveInteger } from '$lib/server/search-param-validation';

type FormSchema = ZodType<Record<string, unknown>>;

/** Create a Zod adapter for superforms */
export const zodAdapter = <T extends FormSchema>(schema: T) => zod4(schema);

/** Validate form data from a request */
export async function validateForm<T extends FormSchema>(schema: T, request: Request) {
	return superValidate(request, zod4(schema));
}

/** Create empty form (for initial load) */
export async function emptyForm<T extends FormSchema>(schema: T) {
	return superValidate(zod4(schema));
}

export function parsePositiveFormId(value: FormDataEntryValue | null): number | null {
	if (typeof value !== 'string') return null;
	return parseCanonicalPositiveInteger(value);
}

export function parseOptionalFormString(
	value: FormDataEntryValue | null
): string | null | undefined {
	if (value === null) return undefined;
	return typeof value === 'string' ? value : null;
}

export function parseOptionalTrimmedFormString(
	value: FormDataEntryValue | null
): string | null | undefined {
	if (value === null) return undefined;
	return typeof value === 'string' ? value.trim() : null;
}
