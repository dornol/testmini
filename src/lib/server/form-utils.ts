import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { ZodType } from 'zod';

/** Create a Zod adapter for superforms */
export const zodAdapter = <T extends ZodType>(schema: T) => zod4(schema);

/** Validate form data from a request */
export async function validateForm<T extends ZodType>(schema: T, request: Request) {
	return superValidate(request, zod4(schema));
}

/** Create empty form (for initial load) */
export async function emptyForm<T extends ZodType>(schema: T) {
	return superValidate(zod4(schema));
}
