import { zodClient } from 'sveltekit-superforms/adapters';
import type { ZodSchema } from 'zod';

/** Create client-side Zod validators for superforms (centralizes Zod 3.x type suppression) */
// @ts-expect-error zod 3.x safeParse return type mismatch with superforms adapter
export const zodValidators = <T extends ZodSchema>(schema: T) => zodClient(schema);
