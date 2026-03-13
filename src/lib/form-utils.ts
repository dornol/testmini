import { zod4Client } from 'sveltekit-superforms/adapters';
import type { ZodType } from 'zod';

/** Create client-side Zod validators for superforms */
export const zodValidators = <T extends ZodType>(schema: T) => zod4Client(schema);
