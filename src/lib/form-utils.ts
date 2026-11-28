import type { zod4Client } from 'sveltekit-superforms/adapters';
import type { ZodType } from 'zod';

type FormSchema = ZodType<Record<string, unknown>>;
type ClientAdapter<T extends FormSchema> = ReturnType<typeof zod4Client<T>>;

/**
 * Client-side Zod validators for superforms that fetch zod, the superforms adapter and the
 * schema only when the first validation runs (a blur or a submit), not when the page loads.
 * The server validates every submission anyway, so the page is already usable without them.
 *
 * Pass the schema as a dynamic import so it stays out of the page's first download:
 * `lazyZodValidators(() => import('$lib/schemas/x.schema').then((m) => m.xSchema))`.
 */
export function lazyZodValidators<T extends FormSchema>(load: () => Promise<T>): ClientAdapter<T> {
	let adapter: Promise<ClientAdapter<T>> | undefined;
	return {
		superFormValidationLibrary: 'zod4',
		validate: async (data: unknown) => {
			adapter ??= Promise.all([load(), import('./zod-client-adapter')]).then(
				([schema, { zod4Client }]) => zod4Client(schema)
			);
			return (await adapter).validate(data as never);
		}
	} as ClientAdapter<T>;
}
