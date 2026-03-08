import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import type { ZodSchema } from 'zod';

/** Create a Zod adapter for superforms (centralizes Zod 3.x type suppression) */
// @ts-expect-error zod 3.x safeParse return type mismatch with superforms adapter
export const zodAdapter = <T extends ZodSchema>(schema: T) => zod(schema);

/** Validate form data from a request */
export async function validateForm<T extends ZodSchema>(schema: T, request: Request) {
	// @ts-expect-error zod 3.x safeParse return type mismatch with superforms adapter
	return superValidate(request, zod(schema));
}

/** Create empty form (for initial load) */
export async function emptyForm<T extends ZodSchema>(schema: T) {
	// @ts-expect-error zod 3.x safeParse return type mismatch with superforms adapter
	return superValidate(zod(schema));
}
