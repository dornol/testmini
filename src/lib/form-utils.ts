import { zod4Client } from 'sveltekit-superforms/adapters';
import type { ZodType } from 'zod';

type FormSchema = ZodType<Record<string, unknown>>;

/** Create client-side Zod validators for superforms */
export const zodValidators = <T extends FormSchema>(schema: T) => zod4Client(schema);
